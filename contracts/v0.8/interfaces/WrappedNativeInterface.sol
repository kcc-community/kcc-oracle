// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface WrappedNativeInterface {
  function balanceOf(address owner) external view returns (uint256 balance);

  function approve(address guy, uint256 wad) external returns (bool);

  function deposit() external payable;

  function withdraw(uint256 wad) external;

  function transfer(address to, uint256 value) external returns (bool success);

  function transferFrom(
    address from,
    address to,
    uint256 value
  ) external returns (bool success);
}
