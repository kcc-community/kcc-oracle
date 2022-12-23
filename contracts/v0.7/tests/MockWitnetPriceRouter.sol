// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "../interfaces/IERC2362.sol";

contract MockWitnetPriceRouter is IERC2362 {
  int256 lastPrice;
  uint256 lastTimestamp;
  uint256 latestUpdateStatus;

  function updatePrice(int256 _lastPrice) external {
    lastPrice = _lastPrice;
    lastTimestamp = block.timestamp;
    latestUpdateStatus = 200;
  }

  function valueFor(bytes32 _id)
    external
    view
    override
    returns (
      int256,
      uint256,
      uint256
    )
  {
    require(_id != "");
    return (lastPrice, lastTimestamp, latestUpdateStatus);
  }
}
