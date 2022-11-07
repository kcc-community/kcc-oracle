// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "./SKCSAggregator.sol";
import "./../SimpleReadAccessController.sol";

/**
 * @notice Wrapper of SKCSAggregator which checks read access on Aggregator-interface methods
 */
contract AccessControlledSKCSAggregator is SKCSAggregator, SimpleReadAccessController {
  constructor(
    SKCSInterface _skcs,
    AggregatorV2V3Interface _kcsUsdAggregator,
    uint256 _lowerBoundExchangeRate,
    uint256 _upperBoundExchangeRate
  ) SKCSAggregator(_skcs, _kcsUsdAggregator, _lowerBoundExchangeRate, _upperBoundExchangeRate) {}

  /*
   * Versioning
   */

  function typeAndVersion() external pure virtual override returns (string memory) {
    return "AccessControlledSKCSAggregator 1.0.0";
  }

  /*
   * v2 Aggregator interface
   */

  /// @inheritdoc SKCSAggregator
  function latestAnswer() public view override checkAccess returns (int256) {
    return super.latestAnswer();
  }

  /// @inheritdoc SKCSAggregator
  function latestTimestamp() public view override checkAccess returns (uint256) {
    return super.latestTimestamp();
  }

  /// @inheritdoc SKCSAggregator
  function latestRound() public view override checkAccess returns (uint256) {
    return super.latestRound();
  }

  /// @inheritdoc SKCSAggregator
  function getAnswer(uint256 _roundId) public view override checkAccess returns (int256) {
    return super.getAnswer(_roundId);
  }

  /// @inheritdoc SKCSAggregator
  function getTimestamp(uint256 _roundId) public view override checkAccess returns (uint256) {
    return super.getTimestamp(_roundId);
  }

  /*
   * v3 Aggregator interface
   */

  /// @inheritdoc SKCSAggregator
  function description() public view override checkAccess returns (string memory) {
    return super.description();
  }

  /// @inheritdoc SKCSAggregator
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

  /// @inheritdoc SKCSAggregator
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
