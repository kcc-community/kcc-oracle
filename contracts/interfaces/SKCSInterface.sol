// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

interface SKCSInterface {
  /// @notice exchange rate of from KCS to sKCS
  /// @return num is the amount of total KCS in protocol
  /// @return dem is the total supply of sKCS
  function exchangeRate() external view returns (uint256 num, uint256 dem);
}
