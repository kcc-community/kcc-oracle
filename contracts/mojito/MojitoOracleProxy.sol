// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "../ConfirmedOwner.sol";
import "./../interfaces/IMojitoOracle.sol";

contract MojitoOracleProxy is IMojitoOracle, ConfirmedOwner {
  IMojitoOracle private s_currentMojitoOracle;
  IMojitoOracle private s_proposedMojitoOracle;

  event MojitoOracleProposed(address indexed current, address indexed proposed);
  event MojitoOracleConfirmed(address indexed previous, address indexed latest);

  constructor(address mojitoOracleAddress) ConfirmedOwner(msg.sender) {
    setMojitoOracle(mojitoOracleAddress);
  }

  function setMojitoOracle(address mojitoOracleAddress) internal {
    s_currentMojitoOracle = IMojitoOracle(mojitoOracleAddress);
  }

  function getMojitoTwap(bytes32 pairId) external view override returns (uint256) {
    return s_currentMojitoOracle.getMojitoTwap(pairId);
  }

  /**
   * @notice returns the current mojito oracle address.
   */
  function mojitoOracle() external view returns (address) {
    return address(s_currentMojitoOracle);
  }

  /**
   * @notice returns the current proposed mojito oracle
   */
  function proposedMojitoOracle() external view returns (address) {
    return address(s_proposedMojitoOracle);
  }

  /**
   * @notice Allows the owner to propose a new address for the mojito oracle
   * @param mojitoOracleAddress The new address for the mojito oracle contract
   */
  function proposeMojitoOracle(address mojitoOracleAddress) external onlyOwner {
    s_proposedMojitoOracle = IMojitoOracle(mojitoOracleAddress);
    emit MojitoOracleProposed(address(s_currentMojitoOracle), mojitoOracleAddress);
  }

  /**
   * @notice Allows the owner to confirm and change the address
   * to the proposed mojito oracle
   * @dev Reverts if the given address doesn't match what was previously
   * proposed
   * @param mojitoOracleAddress The new address for the mojito oracle contract
   */
  function confirmMojitoOracle(address mojitoOracleAddress) external onlyOwner {
    require(mojitoOracleAddress == address(s_proposedMojitoOracle), "Invalid proposed mojito oracle");
    address previousMojitoOracle = address(s_currentMojitoOracle);
    delete s_proposedMojitoOracle;
    setMojitoOracle(mojitoOracleAddress);
    emit MojitoOracleConfirmed(previousMojitoOracle, mojitoOracleAddress);
  }

  function proposedGetMojitoTwap(bytes32 pairId) external view hasProposal returns (uint256) {
    return s_proposedMojitoOracle.getMojitoTwap(pairId);
  }

  function currencyPairId(string memory _caption) external view override returns (bytes32) {
    return s_currentMojitoOracle.currencyPairId(_caption);
  }

  function lookupERC2362ID(bytes32 pairId) external view override returns (string memory _caption) {
    return s_currentMojitoOracle.lookupERC2362ID(pairId);
  }

  /*
   * Modifiers
   */

  modifier hasProposal() {
    require(address(s_proposedMojitoOracle) != address(0), "No proposed mojito oracle present");
    _;
  }
}
