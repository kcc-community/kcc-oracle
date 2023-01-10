// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;
pragma abicoder v2;

import "../interfaces/IPythOracle.sol";

/**
 * @title MockPyth
 */
contract MockPyth is IPythOracle {
  mapping(bytes32 => PythStructs.Price) /* id */ /* PythStructs.Price */
    private s_priceInfo;

  function setPrice(bytes32 id, int64 price) public {
    s_priceInfo[id].price = price;
    s_priceInfo[id].publishTime = block.timestamp;
    s_priceInfo[id].conf = 100;
    s_priceInfo[id].expo = -8;
  }

  function getPriceUnsafe(bytes32 id) external view override returns (PythStructs.Price memory price) {
    return s_priceInfo[id];
  }
}
