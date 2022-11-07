// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;

interface IMojitoOracle {
  function getMojitoTwap(bytes32 pairId) external view returns (uint256);

  function currencyPairId(string memory) external view returns (bytes32);

  function lookupERC2362ID(bytes32 _erc2362id) external view returns (string memory _caption);
}
