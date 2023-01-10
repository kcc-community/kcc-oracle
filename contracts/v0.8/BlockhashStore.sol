// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./ConfirmedOwner.sol";

/**
 * @title BlockhashStore
 * @notice This contract provides a way to access blockhashes older than
 *   the 256 block limit imposed by the BLOCKHASH opcode.
 *   You may assume that any blockhash stored by the contract is correct.
 *   Note that the contract depends on the format of serialized Ethereum
 *   blocks. If a future hardfork of Ethereum changes that format, the
 *   logic in this contract may become incorrect and an updated version
 *   would have to be deployed.
 */
contract BlockhashStore is ConfirmedOwner {
  mapping(uint256 => bytes32) internal s_blockhashes;
  event Blockhashfilled(uint256 indexed blockNumber, bytes32 indexed blockHash);
  event BlockhashfilledByOwner(uint256 indexed blockNumber, bytes32 indexed blockHash);

  constructor(address owner) ConfirmedOwner(owner) {}

  /**
   * @notice stores blockhash of a given block, assuming it is available through BLOCKHASH
   * @param n the number of the block whose blockhash should be stored
   */
  function store(uint256 n) public {
    bytes32 h = blockhash(n);
    require(h != 0x0, "blockhash(n) failed");
    s_blockhashes[n] = h;
    emit Blockhashfilled(n, h);
  }

  function _storeByOwner(uint256 n, bytes32 blockHash) private {
    require(blockHash != 0x0, "blockhash error");
    // handle edge case on simulated chains which possibly have > 256 blocks total.
    require(!storeableBlock(n), "the block number must be earlier than the latest 256 blocks");
    s_blockhashes[n] = blockHash;
    emit BlockhashfilledByOwner(n, blockHash);
  }

  /**
   * @notice stores blockhash of a given block, assuming it is available through BLOCKHASH
   * @param n the number of the block whose blockhash should be stored
   * @param blockHash blockhash
   */
  function storeByOwner(uint256 n, bytes32 blockHash) public onlyOwner {
    _storeByOwner(n, blockHash);
  }

  /**
   * @notice stores blockhash of the earliest block still available through BLOCKHASH.
   */
  function storeEarliest() external {
    store(block.number - 256);
  }

  /**
   * @notice stores blockhash after verifying blockheader of child/subsequent block
   * @param n the number of the block whose blockhash should be stored
   * @param header the rlp-encoded blockheader of block n+1. We verify its correctness by checking
   *   that it hashes to a stored blockhash, and then extract parentHash to get the n-th blockhash.
   */
  function storeVerifyHeader(uint256 n, bytes memory header) public {
    require(keccak256(header) == s_blockhashes[n + 1], "header has unknown blockhash");

    // At this point, we know that header is the correct blockheader for block n+1.

    // The header is an rlp-encoded list. The head item of that list is the 32-byte blockhash of the parent block.
    // Based on how rlp works, we know that blockheaders always have the following form:
    // 0xf9____a0PARENTHASH...
    //   ^ ^   ^
    //   | |   |
    //   | |   +--- PARENTHASH is 32 bytes. rlpenc(PARENTHASH) is 0xa || PARENTHASH.
    //   | |
    //   | +--- 2 bytes containing the sum of the lengths of the encoded list items
    //   |
    //   +--- 0xf9 because we have a list and (sum of lengths of encoded list items) fits exactly into two bytes.
    //
    // As a consequence, the PARENTHASH is always at offset 4 of the rlp-encoded block header.

    bytes32 parentHash;
    assembly {
      parentHash := mload(add(header, 36)) // 36 = 32 byte offset for length prefix of ABI-encoded array
      //    +  4 byte offset of PARENTHASH (see above)
    }

    s_blockhashes[n] = parentHash;
    emit Blockhashfilled(n, parentHash);
  }

  /**
   * @notice returns true if and only if the given block number's blockhash can be retrieved
   *   using the blockhash() instruction.
   * @param blockNumber the block number to check if it's storeable with blockhash()
   */
  function storeableBlock(uint256 blockNumber) private view returns (bool) {
    // handle edge case on simulated chains which possibly have < 256 blocks total.
    return block.number <= 256 ? true : blockNumber >= (block.number - 256);
  }

  /**
   * @notice stores blockhashes of the given block numbers in the configured blockhash store, assuming
   *   they are availble though the blockhash() instruction.
   * @param blockNumbers the block numbers to store the blockhashes of. Must be available via the
   *   blockhash() instruction, otherwise this function call will revert.
   */
  function batchStore(uint256[] memory blockNumbers) public {
    for (uint256 i = 0; i < blockNumbers.length; i++) {
      // skip the block if it's not storeable, the caller will have to check
      // after the transaction is mined to see if the blockhash was truly stored.
      if (!storeableBlock(blockNumbers[i])) {
        continue;
      }
      store(blockNumbers[i]);
    }
  }

  /**
   * @notice stores blockhashes of the given block numbers in the configured blockhash store, assuming
   *   they are availble though the blockhash() instruction.
   * @param blockNumbers the block numbers to store the blockhashes of. Must be available via the
   *   blockhash() instruction, otherwise this function call will revert.
   */
  function batchStoreByOwner(uint256[] memory blockNumbers, bytes32[] memory blockHashes) public onlyOwner {
    require(blockNumbers.length == blockHashes.length, "input array arg lengths mismatch");
    for (uint256 i = 0; i < blockNumbers.length; i++) {
      // skip the block if it's not storeable, the caller will have to check
      // after the transaction is mined to see if the blockhash was truly stored.
      if (storeableBlock(blockNumbers[i])) {
        continue;
      }
      _storeByOwner(blockNumbers[i], blockHashes[i]);
    }
  }

  /**
   * @notice stores blockhashes after verifying blockheader of child/subsequent block
   * @param blockNumbers the block numbers whose blockhashes should be stored, in decreasing order
   * @param headers the rlp-encoded block headers of blockNumbers[i] + 1.
   */
  function batchStoreVerifyHeader(uint256[] memory blockNumbers, bytes[] memory headers) public {
    require(blockNumbers.length == headers.length, "input array arg lengths mismatch");
    for (uint256 i = 0; i < blockNumbers.length; i++) {
      storeVerifyHeader(blockNumbers[i], headers[i]);
    }
  }

  /**
   * @notice gets a blockhash from the store. If no hash is known, this function reverts.
   * @param n the number of the block whose blockhash should be returned
   */
  function getBlockhash(uint256 n) public view returns (bytes32) {
    bytes32 h = s_blockhashes[n];
    require(h != 0x0, "blockhash not found in store");
    return h;
  }

  /**
   * @notice retrieves blockhashes of all the given block numbers from the blockhash store, if available.
   * @param blockNumbers array of block numbers to fetch blockhashes for
   * @return blockhashes array of block hashes corresponding to each block number provided in the `blockNumbers`
   *   param. If the blockhash is not found, 0x0 is returned instead of the real blockhash, indicating
   *   that it is not in the blockhash store.
   */
  function getBlockhashes(uint256[] memory blockNumbers) external view returns (bytes32[] memory) {
    bytes32[] memory blockHashes = new bytes32[](blockNumbers.length);
    for (uint256 i = 0; i < blockNumbers.length; i++) {
      blockHashes[i] = s_blockhashes[blockNumbers[i]];
    }
    return blockHashes;
  }
}
