// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

/**
 * @title MockMojitoOracle
 */
contract MockMojitoOracle {
  uint256 s_amount;

  function updatePrice(uint256 _amount) external {
    s_amount = _amount;
  }

  function getMojitoTwap(bytes32 pairId) external view returns (uint256) {
    require(pairId != "");
    return s_amount;
  }

  function currencyPairId(string memory _caption) external pure returns (bytes32) {
    return keccak256(bytes(_caption));
  }

  function lookupERC2362ID(bytes32 pairId) external pure returns (string memory _caption) {
    require(pairId != "");
    return "Price-KCS/USDT-18";
  }
}
