// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

contract MockMojitoFactory {
  address internal s_pair;

  function setPair(address pair) external {
    s_pair = pair;
  }

  function getPair(address tokenA, address tokenB) external view returns (address) {
    require(tokenA != address(0));
    require(tokenB != address(0));
    return s_pair;
  }
}
