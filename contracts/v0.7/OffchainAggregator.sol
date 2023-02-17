// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "./interfaces/AccessControllerInterface.sol";
import "./interfaces/AggregatorV2V3Interface.sol";
import "./interfaces/TypeAndVersionInterface.sol";
import "./OwnerIsCreator.sol";
import "./SafeMath.sol";
import "./AnchoredView.sol";

/**
  * @notice Onchain verification of reports from the offchain reporting protocol

  * @dev For details on its operation, see the offchain reporting protocol design
  * @dev doc, which refers to this contract as simply the "contract".
*/
contract OffchainAggregator is OwnerIsCreator, AggregatorV2V3Interface, TypeAndVersionInterface, AnchoredView {
  using SafeMath for uint256;
  // Storing these fields used on the hot path in a HotVars variable reduces the
  // retrieval of all of them to a single SLOAD. If any further fields are
  // added, make sure that storage of the struct still takes at most 32 bytes.
  struct HotVars {
    // Oracle Aggregators expose a roundId to consumers. The offchain reporting
    // protocol does not use this id anywhere. We increment it whenever a new
    // transmission is made to provide callers with contiguous ids for successive
    // reports.
    uint32 latestAggregatorRoundId;
  }
  HotVars internal s_hotVars;

  // Transmission records the median answer from the transmit transaction at time timestamp
  struct Transmission {
    int192 answer; // 192 bits ought to be enough for anyone
    uint32 observationsTimestamp; // when were observations made offchain
    uint32 transmissionTimestamp; // when was report received onchain
  }
  mapping(uint32 => Transmission) /* aggregator round ID */
    internal s_transmissions;

  // incremented each time a new config is posted. This count is incorporated
  // into the config digest to prevent replay attacks.
  uint32 internal s_configCount;

  // makes it easier for offchain systems to extract config from logs
  uint32 internal s_latestConfigBlockNumber;

  // makes it easier for offchain systems to extract config from logs
  address internal s_latestTransmitter;

  // lowest answers for calculating the old price or the anchor price
  uint8 public lowerBoundAnchorRatio; //0.8e2
  // highest answers for calculating the old price or the anchor price
  uint8 public upperBoundAnchorRatio; //1.2e2

  uint8 internal constant minLowerBoundAnchorRatio = 0.8e2;
  uint8 internal constant maxUpperBoundAnchorRatio = 1.2e2;

  struct Transmitter {
    bool active;
    // Index of oracle in s_signersList/s_transmittersList
    uint8 index;
  }
  mapping(address => Transmitter) /* transmitter address */
    internal s_transmitters;

  struct Signer {
    bool active;
    // Index of oracle in s_signersList/s_transmittersList
    uint8 index;
  }
  mapping(address => Signer) /* signer address */
    internal s_signers;

  // s_signersList contains the signing address of each oracle
  address[] internal s_signersList;

  // s_transmittersList contains the transmission address of each oracle,
  // i.e. the address the oracle actually sends transactions to the contract from
  address[] internal s_transmittersList;

  /*
   * @param _lowerBoundAnchorRatio lowest answers for calculating the old price or the anchor price
   * @param _upperBoundAnchorRatio highest answers for calculating the old price or the anchor price
   * @param _decimals answers are stored in fixed-point format, with this many digits of precision
   * @param _description short human-readable description of observable this contract's answers pertain to
   * @param _mojitoOracle address of the mojito oracle contract
   * @param _pythOracle address of the pyth oracle contract
   * @param _witnetOracle address of the witnet oracle contract
   * @param _validateAnswerEnabled whether to enable the switch for validate answer
   */
  constructor(
    uint8 _lowerBoundAnchorRatio,
    uint8 _upperBoundAnchorRatio,
    uint8 _decimals,
    string memory _description,
    address _mojitoOracle,
    address _pythOracle,
    address _witnetOracle,
    bool _validateAnswerEnabled
  ) AnchoredView(_mojitoOracle, _pythOracle, _witnetOracle, _decimals, _validateAnswerEnabled) {
    lowerBoundAnchorRatio = _lowerBoundAnchorRatio;
    upperBoundAnchorRatio = _upperBoundAnchorRatio;
    decimals = _decimals;
    s_description = _description;
  }

  /*
   * Versioning
   */
  function typeAndVersion() external pure virtual override returns (string memory) {
    return "OffchainAggregator 2.0.0";
  }

  /*
   * AnchorRatio logic
   */

  event AnchorRatioUpdated(uint8 lowerBoundAnchorRatio, uint8 upperBoundAnchorRatio);

  function setAnchorRatio(uint8 _lowerBoundAnchorRatio, uint8 _upperBoundAnchorRatio) external onlyOwner {
    require(
      minLowerBoundAnchorRatio <= _lowerBoundAnchorRatio,
      "lowerBoundAnchorRatio must greater than or equal to minLowerBoundAnchorRatio"
    );
    require(
      maxUpperBoundAnchorRatio >= _upperBoundAnchorRatio,
      "upperBoundAnchorRatio must less than or equal to maxUpperBoundAnchorRatio"
    );
    require(
      _upperBoundAnchorRatio > _lowerBoundAnchorRatio,
      "upperBoundAnchorRatio must less than lowerBoundAnchorRatio"
    );

    lowerBoundAnchorRatio = _lowerBoundAnchorRatio;
    upperBoundAnchorRatio = _upperBoundAnchorRatio;

    emit AnchorRatioUpdated(lowerBoundAnchorRatio, upperBoundAnchorRatio);
  }

  /*
   * Config logic
   */

  /**
   * @notice triggers a new run of the offchain reporting protocol
   * @param previousConfigBlockNumber block in which the previous config was set, to simplify historic analysis
   * @param configCount ordinal number of this config setting among all config settings over the life of this contract
   * @param signers ith element is address ith oracle uses to sign a report
   * @param transmitters ith element is address ith oracle uses to transmit a report via the transmit method
   */
  event ConfigSet(uint32 previousConfigBlockNumber, uint64 configCount, address[] signers, address[] transmitters);

  /**
   * @notice sets offchain reporting protocol configuration incl. participating oracles
   * @param _transmitters addresses oracles use to transmit the reports
   */
  function setConfig(address[] calldata _signers, address[] calldata _transmitters) external onlyOwner {
    require(_signers.length == _transmitters.length, "oracle length mismatch");

    // remove any old signer/transmitter addresses
    uint256 oldLength = s_signersList.length;
    for (uint256 i = 0; i < oldLength; i++) {
      address signer = s_signersList[i];
      address transmitter = s_transmittersList[i];
      delete s_signers[signer];
      delete s_transmitters[transmitter];
    }
    delete s_signersList;
    delete s_transmittersList;

    // add new signer/transmitter addresses
    for (uint256 i = 0; i < _signers.length; i++) {
      require(!s_signers[_signers[i]].active, "repeated signer address");
      s_signers[_signers[i]] = Signer({active: true, index: uint8(i)});
      require(!s_transmitters[_transmitters[i]].active, "repeated transmitter address");
      s_transmitters[_transmitters[i]] = Transmitter({active: true, index: uint8(i)});
    }
    s_signersList = _signers;
    s_transmittersList = _transmitters;

    uint32 previousConfigBlockNumber = s_latestConfigBlockNumber;
    s_latestConfigBlockNumber = uint32(block.number);
    s_configCount += 1;

    emit ConfigSet(previousConfigBlockNumber, s_configCount, _signers, _transmitters);
  }

  /**
   * @notice information about current offchain reporting protocol configuration
   * @return configCount ordinal number of current config, out of all configs applied to this contract so far
   * @return blockNumber block at which this config was set
   */
  function latestConfigDetails() external view returns (uint32 configCount, uint32 blockNumber) {
    return (s_configCount, s_latestConfigBlockNumber);
  }

  /**
   * @return list of addresses permitted to transmit reports to this contract
   * @dev The list will match the order used to specify the transmitter during setConfig
   */
  function getTransmitters() external view returns (address[] memory) {
    return s_transmittersList;
  }

  /*
   * Transmission logic
   */

  /**
   * @notice indicates that a new report was transmitted
   * @param aggregatorRoundId the round to which this report was assigned
   * @param answer median of the observations attached this report
   * @param transmitter address from which the report was transmitted
   * @param observationsTimestamp when were observations made offchain
   */
  event NewTransmission(
    uint32 indexed aggregatorRoundId,
    int192 answer,
    address transmitter,
    uint32 observationsTimestamp
  );

  /*
   * @notice details about the most transmission details
   * @return nextTransmitter who will be next to transmit the report
   * @return afterNextTransmitter who will transmit the report next afterwards
   * @return nextIndex the index of the next transmitter
   * @return length the length of the s_transmittersList
   * @return roundId aggregator round of latest report
   * @return answer median value from latest report
   * @return startedAt when the latest report was transmitted
   * @return updatedAt when the latest report was transmitted
   */
  function latestTransmissionDetails()
    external
    view
    returns (
      address nextTransmitter,
      address afterNextTransmitter,
      uint8 nextIndex,
      uint256 transmittersLength,
      uint80 roundId,
      int192 answer,
      uint256 startedAt,
      uint256 updatedAt
    )
  {
    require(msg.sender == tx.origin, "Only callable by EOA");

    nextIndex = 0;
    uint8 afterNextIndex = 0;

    // Calculating the index of the next transmitter
    uint256 s_length = s_transmittersList.length;
    if (s_length > 0) {
      // the index of the current transmitter
      Transmitter memory s_transmitter;
      s_transmitter = s_transmitters[s_latestTransmitter];
      if (s_transmitter.active) {
        nextIndex = s_transmitter.index;
        nextIndex++;
        if (s_length == nextIndex) {
          nextIndex = 0;
        }
      }

      afterNextIndex = nextIndex;
      afterNextIndex++;
      if (s_length == afterNextIndex) {
        afterNextIndex = 0;
      }

      nextTransmitter = s_transmittersList[nextIndex];
      afterNextTransmitter = s_transmittersList[afterNextIndex];
    }

    roundId = s_hotVars.latestAggregatorRoundId;
    Transmission memory transmission = s_transmissions[uint32(roundId)];
    return (
      nextTransmitter,
      afterNextTransmitter,
      nextIndex,
      s_length,
      roundId,
      transmission.answer,
      transmission.observationsTimestamp,
      transmission.transmissionTimestamp
    );
  }

  // The constant-length components of the msg.data sent to transmit.
  // See the "If we wanted to call sam" example on for example reasoning
  // https://solidity.readthedocs.io/en/v0.7.2/abi-spec.html
  uint16 private constant TRANSMIT_MSGDATA_CONSTANT_LENGTH_COMPONENT =
    4 + // function selector
      32 + // word containing start location of abiencoded _report value
      32 + // _rs value
      32 + // _ss value
      32 + // _vs value
      32 + // word containing length of _report
      0; // placeholder

  function expectedMsgDataLength() private pure returns (uint256 length) {
    // calldata will never be big enough to make this overflow
    return
      uint256(TRANSMIT_MSGDATA_CONSTANT_LENGTH_COMPONENT) +
      64 + // one byte pure entry in _report
      0; // placeholder
  }

  /**
   * @notice transmit is called to post a new report to the contract
   * @param _report serialized report, which the signatures are signing. See parsing code below for format.
   * @param _rs the R components of the signature on report.
   * @param _ss the S components of the signature on report.
   * @param _vs the V component of the signature on report.
   */
  function transmit(
    // NOTE: If these parameters are changed, expectedMsgDataLength and/or
    // TRANSMIT_MSGDATA_CONSTANT_LENGTH_COMPONENT need to be changed accordingly
    bytes calldata _report,
    // ECDSA signature
    bytes32 _rs,
    bytes32 _ss,
    uint8 _vs
  ) external {
    require(s_transmitters[msg.sender].active, "unauthorized transmitter");

    require(msg.data.length == expectedMsgDataLength(), "transmit message length mismatch");

    uint192 median;
    uint32 observationsTimestamp;
    (median, observationsTimestamp) = abi.decode(_report, (uint192, uint32));

    uint32 s_latestTimestamp = s_transmissions[s_hotVars.latestAggregatorRoundId].transmissionTimestamp;
    require(observationsTimestamp > s_latestTimestamp, "invalid observations timestamp");

    // Verify signatures attached to report
    {
      bytes32 h = keccak256(_report);

      Signer memory signer;
      address signerAddress = ecrecover(h, _vs + 27, _rs, _ss);
      signer = s_signers[signerAddress];
      require(signer.active, "signature error");
    }

    if (validateAnswerEnabled) {
      if (_validateAnswer(uint256(median))) {
        _transmit(int192(median), observationsTimestamp);
      }
    } else {
      uint256 previousAnswer = uint192(s_transmissions[s_hotVars.latestAggregatorRoundId].answer);
      if (previousAnswer > 0) {
        require(isWithinAnchor(median, previousAnswer), "median is out of min-max range");
      }
      _transmit(int192(median), observationsTimestamp);
    }
  }

  function transmitWithForce(uint192 median) external onlyOwner {
    _transmit(int192(median), uint32(block.timestamp));
  }

  function _transmit(int192 median, uint32 observationsTimestamp) internal {
    HotVars memory hotVars = s_hotVars; // cache read from storage
    hotVars.latestAggregatorRoundId++;
    s_transmissions[hotVars.latestAggregatorRoundId] = Transmission({
      answer: median,
      observationsTimestamp: observationsTimestamp,
      transmissionTimestamp: uint32(block.timestamp)
    });

    s_latestTransmitter = msg.sender;
    emit NewTransmission(hotVars.latestAggregatorRoundId, median, msg.sender, observationsTimestamp);
    // Emit these for backwards compatability with offchain consumers
    // that only support legacy events
    emit NewRound(
      hotVars.latestAggregatorRoundId,
      address(0x0), // use zero address since we don't have anybody "starting" the round here
      observationsTimestamp
    );
    emit AnswerUpdated(median, hotVars.latestAggregatorRoundId, block.timestamp);

    // persist updates to hotVars
    s_hotVars = hotVars;
  }

  /// @notice The event emitted when new prices are posted but the stored price is not updated due to the anchor
  event AnswerGuarded(
    uint32 indexed aggregatorRoundId,
    uint256 reporterPrice,
    uint256 anchorMojitoPrice,
    uint256 anchorPythPrice,
    uint256 anchorWitnetPrice,
    uint256 updatedAt
  );

  /**
   * @notice This is called by the reporter whenever a new price is posted on-chain
   * @param reporterPrice the price from the reporter
   * @return valid bool
   */
  function _validateAnswer(uint256 reporterPrice) internal returns (bool) {
    uint256 anchorMojitoPrice = _getMojitoPriceInternal();

    if (isWithinAnchor(reporterPrice, anchorMojitoPrice)) {
      return true;
    } else {
      uint256 anchorPythPrice = _getPythPriceInternal();
      if (isWithinAnchor(reporterPrice, anchorPythPrice)) {
        return true;
      } else {
        uint256 anchorWitnetPrice = _getWitnetPriceInternal();
        if (isWithinAnchor(reporterPrice, anchorWitnetPrice)) {
          return true;
        } else {
          emit AnswerGuarded(
            s_hotVars.latestAggregatorRoundId + 1,
            reporterPrice,
            anchorMojitoPrice,
            anchorPythPrice,
            anchorWitnetPrice,
            block.timestamp
          );
          return false;
        }
      }
    }
  }

  /**
   * @notice This is called by the reporter whenever a new price is posted on-chain
   * @param reporterPrice the price from the reporter
   * @param anchorPrice the price from the other contract
   * @return valid bool
   */
  function isWithinAnchor(uint256 reporterPrice, uint256 anchorPrice) internal view returns (bool) {
    if (reporterPrice > 0 && anchorPrice > 0) {
      uint256 minAnswer = anchorPrice.mul(lowerBoundAnchorRatio).div(1e2);
      uint256 maxAnswer = anchorPrice.mul(upperBoundAnchorRatio).div(1e2);
      return minAnswer <= reporterPrice && reporterPrice <= maxAnswer;
    }
    return false;
  }

  /*
   * v2 Aggregator interface
   */

  /**
   * @notice median from the most recent report
   */
  function latestAnswer() public view virtual override returns (int256) {
    return s_transmissions[s_hotVars.latestAggregatorRoundId].answer;
  }

  /**
   * @notice timestamp of block in which last report was transmitted
   */
  function latestTimestamp() public view virtual override returns (uint256) {
    return s_transmissions[s_hotVars.latestAggregatorRoundId].transmissionTimestamp;
  }

  /**
   * @notice Aggregator round (NOT OCR round) in which last report was transmitted
   */
  function latestRound() public view virtual override returns (uint256) {
    return s_hotVars.latestAggregatorRoundId;
  }

  /**
   * @notice median of report from given aggregator round (NOT OCR round)
   * @param _roundId the aggregator round of the target report
   */
  function getAnswer(uint256 _roundId) public view virtual override returns (int256) {
    if (_roundId > 0xFFFFFFFF) {
      return 0;
    }
    return s_transmissions[uint32(_roundId)].answer;
  }

  /**
   * @notice timestamp of block in which report from given aggregator round was transmitted
   * @param _roundId aggregator round (NOT OCR round) of target report
   */
  function getTimestamp(uint256 _roundId) public view virtual override returns (uint256) {
    if (_roundId > 0xFFFFFFFF) {
      return 0;
    }
    return s_transmissions[uint32(_roundId)].transmissionTimestamp;
  }

  /*
   * v3 Aggregator interface
   */

  string private constant V3_NO_DATA_ERROR = "No data present";

  /**
   * @return answers are stored in fixed-point format, with this many digits of precision
   */
  uint8 public immutable override decimals;

  /**
   * @notice aggregator contract version
   */
  uint256 public constant override version = 2;

  string internal s_description;

  /**
   * @notice human-readable description of observable this contract is reporting on
   */
  function description() public view virtual override returns (string memory) {
    return s_description;
  }

  /**
   * @notice details for the given aggregator round
   * @param _roundId target aggregator round (NOT OCR round). Must fit in uint32
   * @return roundId _roundId
   * @return answer median of report from given _roundId
   * @return startedAt timestamp of block in which report from given _roundId was transmitted
   * @return updatedAt timestamp of block in which report from given _roundId was transmitted
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
    require(_roundId <= 0xFFFFFFFF, V3_NO_DATA_ERROR);
    Transmission memory transmission = s_transmissions[uint32(_roundId)];
    return (
      _roundId,
      transmission.answer,
      transmission.observationsTimestamp,
      transmission.transmissionTimestamp,
      _roundId
    );
  }

  /**
   * @notice aggregator details for the most recently transmitted report
   * @return roundId aggregator round of latest report (NOT OCR round)
   * @return answer median of latest report
   * @return startedAt timestamp of block containing latest report
   * @return updatedAt timestamp of block containing latest report
   * @return answeredInRound aggregator round of latest report
   */
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
    roundId = s_hotVars.latestAggregatorRoundId;

    // Skipped for compatability with existing FluxAggregator in which latestRoundData never reverts.
    // require(roundId != 0, V3_NO_DATA_ERROR);

    Transmission memory transmission = s_transmissions[uint32(roundId)];
    return (
      roundId,
      transmission.answer,
      transmission.observationsTimestamp,
      transmission.transmissionTimestamp,
      roundId
    );
  }
}
