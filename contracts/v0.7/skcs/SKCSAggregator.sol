// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "./../interfaces/SKCSInterface.sol";
import "./../interfaces/AggregatorV2V3Interface.sol";
import "./../interfaces/TypeAndVersionInterface.sol";
import "./../SafeMath.sol";
import "./../OwnerIsCreator.sol";

contract SKCSAggregator is OwnerIsCreator, AggregatorV2V3Interface, TypeAndVersionInterface {
  using SafeMath for uint256;

  // skcs contract
  SKCSInterface public sKCS;

  // kcs-usd aggregator
  AggregatorV2V3Interface public kcsUsdAggregator;

  /**
   * @notice aggregator contract version
   */
  uint256 public constant override version = 1;

  uint32 internal constant latestAggregatorRoundId = 1;

  /**
   * @return answers are stored in fixed-point format, with this many digits of precision
   */
  uint8 public constant override decimals = 8;

  string internal s_description = "sKCS / USD";

  // The lowest exchange rate of the supply of skcs to the num of kcs on skc
  uint256 public constant minLowerBoundExchangeRate = 1e18;
  // The highest exchange rate of the supply of skcs to the num of kcs on skc
  uint256 public constant maxUpperBoundExchangeRate = 2e18;

  // lowerBoundExchangeRate must be greater than minLowerBoundExchangeRate
  uint256 public lowerBoundExchangeRate;
  // upperBoundExchangeRate must be less than maxUpperBoundExchangeRate
  uint256 public upperBoundExchangeRate;

  /*
   * @param _lowerBoundExchangeRate lowest exchange rate of the supply of skcs to the num of kcs on skc
   * @param _upperBoundExchangeRate highest exchange rate of the supply of skcs to the num of kcs on skc
   */
  constructor(
    SKCSInterface _skcs,
    AggregatorV2V3Interface _kcsUsdAggregator,
    uint256 _lowerBoundExchangeRate,
    uint256 _upperBoundExchangeRate
  ) {
    sKCS = _skcs;
    kcsUsdAggregator = _kcsUsdAggregator;
    lowerBoundExchangeRate = _lowerBoundExchangeRate;
    upperBoundExchangeRate = _upperBoundExchangeRate;
  }

  /*
   * Versioning
   */
  function typeAndVersion() external pure virtual override returns (string memory) {
    return "SKCSAggregator 1.0.0";
  }

  /*
   * ExchangeRateRange logic
   */
  /// @notice Emitted when exchange rate incentive is changed by admin
  event ExchangeRateRangeUpdated(uint256 lowerBoundExchangeRate, uint256 upperBoundExchangeRate);

  function _setExchangeRateRange(uint256 _lowerBoundExchangeRate, uint256 _upperBoundExchangeRate) external onlyOwner {
    require(
      minLowerBoundExchangeRate <= _lowerBoundExchangeRate,
      "lowerBoundExchangeRate must greater than or equal to minLowerBoundExchangeRate"
    );
    require(
      maxUpperBoundExchangeRate >= _upperBoundExchangeRate,
      "upperBoundExchangeRate must less than or equal to maxUpperBoundExchangeRate"
    );
    require(
      _upperBoundExchangeRate > _lowerBoundExchangeRate,
      "upperBoundExchangeRate must Less than lowerBoundExchangeRate"
    );

    lowerBoundExchangeRate = _lowerBoundExchangeRate;
    upperBoundExchangeRate = _upperBoundExchangeRate;

    emit ExchangeRateRangeUpdated(lowerBoundExchangeRate, upperBoundExchangeRate);
  }

  /// @notice Emitted when the skcs contract of address is changed
  event NewSKCSUpdated(SKCSInterface oldSKCS, SKCSInterface newSKCS);

  /**
   * @notice Sets a new skcs contract
   * @dev Admin function to set a new skcs contract
   */
  function _setNewSKCS(SKCSInterface _newSKCS) external onlyOwner {
    SKCSInterface oldSKCS = sKCS;
    sKCS = _newSKCS;
    emit NewSKCSUpdated(oldSKCS, _newSKCS);
  }

  /*
   * v2 Aggregator interface
   */

  /**
   * @notice answer from the most recent report
   */
  function latestAnswer() public view virtual override returns (int256) {
    uint256 exchangeRate = exchangeRateCurrent();
    require(
      exchangeRate >= lowerBoundExchangeRate,
      "exchangeRate must greater than or equal to lowerBoundExchangeRate"
    );
    require(exchangeRate <= upperBoundExchangeRate, "exchangeRate must less than or equal to upperBoundExchangeRate");
    uint256 kcsUsdPrice = kcsUsdPriceCurrent();
    uint256 skcsUsdPrice = kcsUsdPrice.mul(exchangeRate).div(1e18);
    return int256(skcsUsdPrice);
  }

  // kcs-usd price form kcs-usd eac aggregator proxy, with 8 decimals
  function kcsUsdPriceCurrent() public view returns (uint256) {
    int256 kcsUsdPrice = kcsUsdAggregator.latestAnswer();
    return uint256(kcsUsdPrice);
  }

  // exchange rate form skcs proxy, kcs num / skcs total supply, with 18 decimals
  function exchangeRateCurrent() public view returns (uint256) {
    (uint256 kcsNum, uint256 skcsNum) = sKCS.exchangeRate();
    uint256 exchangeRate = kcsNum.mul(1e18).div(skcsNum);
    return exchangeRate;
  }

  /**
   * @notice timestamp of block in which last report was transmitted
   */
  function latestTimestamp() public view virtual override returns (uint256) {
    return block.timestamp;
  }

  /**
   * @notice Aggregator round (NOT OCR round) in which last report was transmitted
   */
  function latestRound() public view virtual override returns (uint256) {
    return latestAggregatorRoundId;
  }

  /**
   * @notice median of report from given aggregator round (NOT OCR round)
   * @param _roundId the aggregator round of the target report
   */
  function getAnswer(uint256 _roundId) public view virtual override returns (int256) {
    _roundId;
    return latestAnswer();
  }

  /**
   * @notice timestamp of block in which report from given aggregator round was transmitted
   * @param _roundId aggregator round (NOT OCR round) of target report
   */
  function getTimestamp(uint256 _roundId) public view virtual override returns (uint256) {
    _roundId;
    return latestTimestamp();
  }

  /**
   * @notice human-readable description of observable this contract is reporting on
   */
  function description() public view virtual override returns (string memory) {
    return s_description;
  }

  /**
   * @notice details for the given aggregator round
   * @param _roundId target aggregator round. Must fit in uint32
   * @return roundId _roundId
   * @return answer median of report from given _roundId
   * @return startedAt timestamp of block in which report from given _roundId was updated
   * @return updatedAt timestamp of block in which report from given _roundId was updated
   * @return answeredInRound _roundId
   */
  function getRoundData(uint80 _roundId)
    public
    view
    virtual
    override
    returns (
      uint80 roundId,
      int256 answer,
      uint256 startedAt,
      uint256 updatedAt,
      uint80 answeredInRound
    )
  {
    _roundId;

    return latestRoundData();
  }

  function latestRoundData()
    public
    view
    virtual
    override
    returns (
      uint80 roundId,
      int256 answer,
      uint256 startedAt,
      uint256 updatedAt,
      uint80 answeredInRound
    )
  {
    return (latestAggregatorRoundId, latestAnswer(), latestTimestamp(), latestTimestamp(), latestAggregatorRoundId);
  }
}
