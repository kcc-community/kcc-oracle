// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "./OffchainAggregator.sol";
import "./SimpleReadAccessController.sol";

/**
 * @notice Wrapper of OffchainAggregator which checks read access on Aggregator-interface methods
 */
contract AccessControlledOffchainAggregator is OffchainAggregator, SimpleReadAccessController {
  constructor(
    uint8 _lowerBoundAnchorRatio,
    uint8 _upperBoundAnchorRatio,
    uint8 _decimals,
    string memory _description,
    address _mojitoOracle,
    address _pythOracle,
    address _witnetOracle,
    bool _validateAnswerEnabled
  )
    OffchainAggregator(
      _lowerBoundAnchorRatio,
      _upperBoundAnchorRatio,
      _decimals,
      _description,
      _mojitoOracle,
      _pythOracle,
      _witnetOracle,
      _validateAnswerEnabled
    )
  {}

  /*
   * Versioning
   */

  function typeAndVersion() external pure virtual override returns (string memory) {
    return "AccessControlledOffchainAggregator 1.0.0";
  }

  /*
   * v2 Aggregator interface
   */

  /// @inheritdoc OffchainAggregator
  function latestAnswer() public view override checkAccess returns (int256) {
    return super.latestAnswer();
  }

  /// @inheritdoc OffchainAggregator
  function latestTimestamp() public view override checkAccess returns (uint256) {
    return super.latestTimestamp();
  }

  /// @inheritdoc OffchainAggregator
  function latestRound() public view override checkAccess returns (uint256) {
    return super.latestRound();
  }

  /// @inheritdoc OffchainAggregator
  function getAnswer(uint256 _roundId) public view override checkAccess returns (int256) {
    return super.getAnswer(_roundId);
  }

  /// @inheritdoc OffchainAggregator
  function getTimestamp(uint256 _roundId) public view override checkAccess returns (uint256) {
    return super.getTimestamp(_roundId);
  }

  /*
   * v3 Aggregator interface
   */

  /// @inheritdoc OffchainAggregator
  function description() public view override checkAccess returns (string memory) {
    return super.description();
  }

  /// @inheritdoc OffchainAggregator
  function getRoundData(uint80 _roundId)
    public
    view
    override
    checkAccess
    returns (
      uint80 roundId,
      int256 answer,
      uint256 startedAt,
      uint256 updatedAt,
      uint80 answeredInRound
    )
  {
    return super.getRoundData(_roundId);
  }

  /// @inheritdoc OffchainAggregator
  function latestRoundData()
    public
    view
    override
    checkAccess
    returns (
      uint80 roundId,
      int256 answer,
      uint256 startedAt,
      uint256 updatedAt,
      uint80 answeredInRound
    )
  {
    return super.latestRoundData();
  }
}
