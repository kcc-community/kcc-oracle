// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

contract Reverter {
  fallback() external payable {
    require(false, "Raised by Reverter.sol");
  }
}
