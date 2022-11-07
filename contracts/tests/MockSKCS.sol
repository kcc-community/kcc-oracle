// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

contract MockSKCS {
  function exchangeRate() external pure returns (uint256 num, uint256 dem) {
    num = 1.1e18;
    dem = 1e18;
  }
}
