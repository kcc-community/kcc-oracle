// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "./interfaces/IMojitoOracle.sol";
import "./interfaces/IERC2362.sol";
import "./OwnerIsCreator.sol";
import "./SafeMath.sol";

contract AnchoredView is OwnerIsCreator {
  using SafeMath for uint256;

  bool public validateAnswerEnabled;
  /// @notice how many digits of precision to retain, in 1e-decimals token units
  uint256 public immutable answerBaseUnit;

  struct MojitoConfig {
    bool available;
    bytes32 pairA;
    uint256 pairABaseUnit;
  }

  MojitoConfig internal mojitoConfig;

  /// @notice emitted when mojito config are set
  event MojitoConfigSet(bool available, bytes32 pairA, uint256 pairABaseUnit);

  struct WitnetConfig {
    bool available;
    bytes32 pairA;
    bytes32 pairB;
    uint256 pairABaseUnit;
    uint256 pairBBaseUnit;
  }

  WitnetConfig internal witnetConfig;

  /// @notice emitted when witnet config are set
  event WitnetConfigSet(bool available, bytes32 pairA, bytes32 pairB, uint256 pairABaseUnit, uint256 pairBBaseUnit);

  // The price oracle
  IMojitoOracle public mojitoOracle;
  IERC2362 public witnetOracle;

  /**
   * @notice emitted when a new mojito oracle contract is set
   * @param old the address prior to the current setting
   * @param current the address of the new mojito oracle contract
   */
  event MojitoOracleSet(IMojitoOracle old, IMojitoOracle current);
  /**
   * @notice emitted when a new witnet oracle contract is set
   * @param old the address prior to the current setting
   * @param current the address of the new witnet oracle contract
   */
  event WitnetOracleSet(IERC2362 old, IERC2362 current);

  event ValidateAnswerEnabled();
  event ValidateAnswerDisabled();

  /*
   * @param _mojitoOracle address of the mojito oracle contract
   * @param _witnetOracle address of the witnet oracle contract
   * @param _decimals answers are stored in fixed-point format, with this many digits of precision
   * @param _validateAnswerEnabled whether to enable the switch for validate answer
   */
  constructor(
    address _mojitoOracle,
    address _witnetOracle,
    uint8 _decimals,
    bool _validateAnswerEnabled
  ) {
    _setMojitoOracle(IMojitoOracle(_mojitoOracle));
    _setWitnetOracle(IERC2362(_witnetOracle));
    // pow(10, _decimals)
    answerBaseUnit = 10**_decimals;
    validateAnswerEnabled = _validateAnswerEnabled;
  }

  /**
   * @notice sets the mojito twap oracle
   * @param _oracle the address of the mojito oracle contract
   */
  function setMojitoOracle(IMojitoOracle _oracle) external onlyOwner {
    _setMojitoOracle(_oracle);
  }

  function _setMojitoOracle(IMojitoOracle _oracle) internal {
    IMojitoOracle oldOracle = mojitoOracle;
    if (_oracle != oldOracle) {
      mojitoOracle = _oracle;
      emit MojitoOracleSet(oldOracle, _oracle);
    }
  }

  /**
   * @notice sets the witnet oracle
   * @param _oracle the address of the witnet oracle contract
   */
  function setWitnetOracle(IERC2362 _oracle) external onlyOwner {
    _setWitnetOracle(_oracle);
  }

  function _setWitnetOracle(IERC2362 _oracle) internal {
    IERC2362 oldOracle = witnetOracle;
    if (_oracle != oldOracle) {
      witnetOracle = _oracle;
      emit WitnetOracleSet(oldOracle, _oracle);
    }
  }

  function _getMojitoPriceInternal() internal view returns (uint256) {
    if (mojitoConfig.available) {
      uint256 twapPrice = mojitoOracle.getMojitoTwap(mojitoConfig.pairA);
      return twapPrice.mul(answerBaseUnit).div(mojitoConfig.pairABaseUnit);
    }
    return 0;
  }

  function _getWitnetPriceInternal() internal view returns (uint256) {
    if (witnetConfig.available) {
      int256 pairAPrice;
      (pairAPrice, , ) = witnetOracle.valueFor(witnetConfig.pairA);
      if (witnetConfig.pairB == "") {
        return uint256(pairAPrice).mul(answerBaseUnit).div(witnetConfig.pairABaseUnit);
      } else {
        int256 pairBPrice;
        (pairBPrice, , ) = witnetOracle.valueFor(witnetConfig.pairB);
        return
          uint256(pairAPrice).mul(uint256(pairBPrice)).mul(answerBaseUnit).div(witnetConfig.pairABaseUnit).div(
            witnetConfig.pairBBaseUnit
          );
      }
    }
    return 0;
  }

  /**
   * @notice sets mojito parameters
   * @param _available is the price available
   * @param _pairA pairA erc2362 asset id
   * @param _pairABaseUnit pairA decimals
   * @dev must be called by owner
   */
  function setMojitoConfig(
    bool _available,
    bytes32 _pairA,
    uint256 _pairABaseUnit
  ) external onlyOwner {
    mojitoConfig.available = _available;
    mojitoConfig.pairA = _pairA;
    mojitoConfig.pairABaseUnit = _pairABaseUnit;
    emit MojitoConfigSet(_available, _pairA, _pairABaseUnit);
  }

  /*
   * @notice gets the mojito config
   * @return The config object
   */
  function getMojitoConfig()
    external
    view
    returns (
      bool available,
      bytes32 pairA,
      uint256 pairABaseUnit
    )
  {
    return (mojitoConfig.available, mojitoConfig.pairA, mojitoConfig.pairABaseUnit);
  }

  /**
   * @notice sets winet parameters
   * @param _available is the price available
   * @param _pairA pairA erc2362 asset id
   * @param _pairB pairB erc2362 asset id, optimal exchange rate when used
   * @param _pairABaseUnit pairA decimals
   * @param _pairBBaseUnit pairB decimals
   * @dev must be called by owner
   */
  function setWitnetConfig(
    bool _available,
    bytes32 _pairA,
    bytes32 _pairB,
    uint256 _pairABaseUnit,
    uint256 _pairBBaseUnit
  ) external onlyOwner {
    witnetConfig.available = _available;
    witnetConfig.pairA = _pairA;
    witnetConfig.pairB = _pairB;
    witnetConfig.pairABaseUnit = _pairABaseUnit;
    witnetConfig.pairBBaseUnit = _pairBBaseUnit;
    emit WitnetConfigSet(_available, _pairA, _pairB, _pairABaseUnit, _pairBBaseUnit);
  }

  /*
   * @notice gets the witnet config
   * @return The config object
   */
  function getWitnetConfig()
    external
    view
    returns (
      bool available,
      bytes32 pairA,
      bytes32 pairB,
      uint256 pairABaseUnit,
      uint256 pairBBaseUnit
    )
  {
    return (
      witnetConfig.available,
      witnetConfig.pairA,
      witnetConfig.pairB,
      witnetConfig.pairABaseUnit,
      witnetConfig.pairBBaseUnit
    );
  }

  /**
   * @notice Get the mojito oracle twap for a underlying
   * @return Price denominated in USD, with 8 decimals
   */
  function getMojitoPrice() external view returns (uint256) {
    return _getMojitoPriceInternal();
  }

  /**
   * @notice Get the witnet oracle price for a underlying
   * @return Price denominated in USD, with 8 decimals
   */
  function getWitnetPrice() external view returns (uint256) {
    return _getWitnetPriceInternal();
  }

  /**
   * @notice makes the answer validate enforced
   */
  function enableAnswerValidate() external onlyOwner {
    if (!validateAnswerEnabled) {
      validateAnswerEnabled = true;

      emit ValidateAnswerEnabled();
    }
  }

  /**
   * @notice makes the answer validate unenforced
   */
  function disableAnswerValidate() external onlyOwner {
    if (validateAnswerEnabled) {
      validateAnswerEnabled = false;

      emit ValidateAnswerDisabled();
    }
  }
}
