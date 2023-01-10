// SPDX-License-Identifier: MIT
pragma solidity ^0.8.6;

import "./ConfirmedOwner.sol";
import "./interfaces/TypeAndVersionInterface.sol";
import "./VRFConsumerBaseV2.sol";
import "./interfaces/VRFCoordinatorV2Interface.sol";
import "./interfaces/VRFV2WrapperInterface.sol";
import "./VRFV2WrapperConsumerBase.sol";
import "./interfaces/WrappedNativeInterface.sol";

/**
 * @notice A wrapper for VRFCoordinatorV2 that provides an interface better suited to one-off
 * @notice requests for randomness.
 */
contract VRFV2Wrapper is ConfirmedOwner, TypeAndVersionInterface, VRFConsumerBaseV2, VRFV2WrapperInterface {
  event WrapperFulfillmentFailed(uint256 indexed requestId, address indexed consumer);

  WrappedNativeInterface public immutable WRAPPER_TOKEN;
  ExtendedVRFCoordinatorV2Interface public immutable COORDINATOR;

  uint64 public immutable SUBSCRIPTION_ID;

  // 5k is plenty for an EXTCODESIZE call (2600) + warm CALL (100)
  // and some arithmetic operations.
  uint256 private constant GAS_FOR_CALL_EXACT_CHECK = 5_000;

  // Configuration fetched from VRFCoordinatorV2

  // Whether the subscriber needs to pay a fee to the oracle, true to charge a fee false to not charge a fee
  bool public override paymentEnabled;

  // s_configured tracks whether this contract has been configured. If not configured, randomness
  // requests cannot be made.
  bool public s_configured;

  // s_disabled disables the contract when true. When disabled, new VRF requests cannot be made
  // but existing ones can still be fulfilled.
  bool public s_disabled;

  // s_fallbackWeiPerUnitNative 1 native = 1e18 wei
  uint256 private constant s_fallbackWeiPerUnitNative = 1e18;

  // s_fulfillmentFlatFeePPM is the flat fee in millionths of WKCS that VRFCoordinatorV2
  // charges.
  uint32 private s_fulfillmentFlatFeePPM;

  // Other configuration

  // s_wrapperGasOverhead reflects the gas overhead of the wrapper's fulfillRandomWords
  // function. The cost for this gas is passed to the user.
  uint32 private s_wrapperGasOverhead;

  // s_coordinatorGasOverhead reflects the gas overhead of the coordinator's fulfillRandomWords
  // function. The cost for this gas is billed to the subscription, and must therefor be included
  // in the pricing for wrapped requests. This includes the gas costs of proof verification and
  // payment calculation in the coordinator.
  uint32 private s_coordinatorGasOverhead;

  // s_wrapperPremiumPercentage is the premium ratio in percentage. For example, a value of 0
  // indicates no premium. A value of 15 indicates a 15 percent premium.
  uint8 private s_wrapperPremiumPercentage;

  // s_keyHash is the key hash to use when requesting randomness. Fees are paid based on current gas
  // fees, so this should be set to the highest gas lane on the network.
  bytes32 s_keyHash;

  // s_maxNumWords is the max number of words that can be requested in a single wrapped VRF request.
  uint8 s_maxNumWords;

  struct Callback {
    address callbackAddress;
    uint32 callbackGasLimit;
    uint256 requestGasPrice;
    uint256 juelsPaid;
  }
  mapping(uint256 => Callback) /* requestID */ /* callback */
    public s_callbacks;

  constructor(address _wrapperToken, address _coordinator) ConfirmedOwner(msg.sender) VRFConsumerBaseV2(_coordinator) {
    WRAPPER_TOKEN = WrappedNativeInterface(_wrapperToken);
    COORDINATOR = ExtendedVRFCoordinatorV2Interface(_coordinator);

    // Create this wrapper's subscription and add itself as a consumer.
    uint64 subId = ExtendedVRFCoordinatorV2Interface(_coordinator).createSubscription();
    SUBSCRIPTION_ID = subId;
    ExtendedVRFCoordinatorV2Interface(_coordinator).addConsumer(subId, address(this));
  }

  /**
   * @notice setConfig configures VRFV2Wrapper.
   *
   * @dev Sets wrapper-specific configuration based on the given parameters, and fetches any needed
   * @dev VRFCoordinatorV2 configuration from the coordinator.
   *
   * @param _wrapperGasOverhead reflects the gas overhead of the wrapper's fulfillRandomWords
   *        function.
   *
   * @param _coordinatorGasOverhead reflects the gas overhead of the coordinator's
   *        fulfillRandomWords function.
   *
   * @param _wrapperPremiumPercentage is the premium ratio in percentage for wrapper requests.
   *
   * @param _keyHash to use for requesting randomness.
   */
  function setConfig(
    uint32 _wrapperGasOverhead,
    uint32 _coordinatorGasOverhead,
    uint8 _wrapperPremiumPercentage,
    bytes32 _keyHash,
    uint8 _maxNumWords
  ) external onlyOwner {
    s_wrapperGasOverhead = _wrapperGasOverhead;
    s_coordinatorGasOverhead = _coordinatorGasOverhead;
    s_wrapperPremiumPercentage = _wrapperPremiumPercentage;
    s_keyHash = _keyHash;
    s_maxNumWords = _maxNumWords;
    s_configured = true;

    // Get other configuration from coordinator
    (, , , paymentEnabled, s_fulfillmentFlatFeePPM) = COORDINATOR.getConfig();
  }

  /**
   * @notice getConfig returns the current VRFV2Wrapper configuration.
   *
   *
   * @return fulfillmentFlatFeePPM is the flat fee in millionths of WKCS that VRFCoordinatorV2
   *         charges.
   *
   * @return wrapperGasOverhead reflects the gas overhead of the wrapper's fulfillRandomWords
   *         function. The cost for this gas is passed to the user.
   *
   * @return coordinatorGasOverhead reflects the gas overhead of the coordinator's
   *         fulfillRandomWords function.
   *
   * @return wrapperPremiumPercentage is the premium ratio in percentage. For example, a value of 0
   *         indicates no premium. A value of 15 indicates a 15 percent premium.
   *
   * @return keyHash is the key hash to use when requesting randomness. Fees are paid based on
   *         current gas fees, so this should be set to the highest gas lane on the network.
   *
   * @return maxNumWords is the max number of words that can be requested in a single wrapped VRF
   *         request.
   */
  function getConfig()
    external
    view
    returns (
      uint32 fulfillmentFlatFeePPM,
      uint32 wrapperGasOverhead,
      uint32 coordinatorGasOverhead,
      uint8 wrapperPremiumPercentage,
      bytes32 keyHash,
      uint8 maxNumWords
    )
  {
    return (
      s_fulfillmentFlatFeePPM,
      s_wrapperGasOverhead,
      s_coordinatorGasOverhead,
      s_wrapperPremiumPercentage,
      s_keyHash,
      s_maxNumWords
    );
  }

  /**
   * @notice Calculates the price of a VRF request with the given callbackGasLimit at the current
   * @notice block.
   *
   * @dev This function relies on the transaction gas price which is not automatically set during
   * @dev simulation. To estimate the price at a specific gas price, use the estimatePrice function.
   *
   * @param _callbackGasLimit is the gas limit used to estimate the price.
   */
  function calculateRequestPrice(uint32 _callbackGasLimit)
    external
    view
    override
    onlyConfiguredNotDisabled
    returns (uint256)
  {
    return calculateRequestPriceInternal(_callbackGasLimit, tx.gasprice);
  }

  /**
   * @notice Estimates the price of a VRF request with a specific gas limit and gas price.
   *
   * @dev This is a convenience function that can be called in simulation to better understand
   * @dev pricing.
   *
   * @param _callbackGasLimit is the gas limit used to estimate the price.
   * @param _requestGasPriceWei is the gas price in wei used for the estimation.
   */
  function estimateRequestPrice(uint32 _callbackGasLimit, uint256 _requestGasPriceWei)
    external
    view
    override
    onlyConfiguredNotDisabled
    returns (uint256)
  {
    return calculateRequestPriceInternal(_callbackGasLimit, _requestGasPriceWei);
  }

  function calculateRequestPriceInternal(uint256 _gas, uint256 _requestGasPrice) internal view returns (uint256) {
    uint256 baseFee = (1e18 * _requestGasPrice * (_gas + s_wrapperGasOverhead + s_coordinatorGasOverhead)) /
      s_fallbackWeiPerUnitNative;

    uint256 feeWithPremium = (baseFee * (s_wrapperPremiumPercentage + 100)) / 100;

    uint256 feeWithFlatFee = feeWithPremium + (1e12 * uint256(s_fulfillmentFlatFeePPM));

    return feeWithFlatFee;
  }

  function requestRandomness(
    uint256 _amount,
    uint32 callbackGasLimit,
    uint16 requestConfirmations,
    uint32 numWords
  ) external override onlyConfiguredNotDisabled returns (uint256 requestId) {
    uint32 eip150Overhead = getEIP150Overhead(callbackGasLimit);

    if (paymentEnabled) {
      uint256 price = calculateRequestPriceInternal(callbackGasLimit, tx.gasprice);
      require(_amount >= price, "fee too low");
      WRAPPER_TOKEN.transferFrom(msg.sender, address(this), _amount);
    }

    require(numWords <= s_maxNumWords, "numWords too high");

    requestId = COORDINATOR.requestRandomWords(
      s_keyHash,
      SUBSCRIPTION_ID,
      requestConfirmations,
      callbackGasLimit + eip150Overhead + s_wrapperGasOverhead,
      numWords
    );
    s_callbacks[requestId] = Callback({
      callbackAddress: msg.sender,
      callbackGasLimit: callbackGasLimit,
      requestGasPrice: tx.gasprice,
      juelsPaid: _amount
    });
    return requestId;
  }

  /**
   * @notice withdraw is used by the VRFV2Wrapper's owner to withdraw WKCS revenue.
   *
   * @param _recipient is the address that should receive the WKCS funds.
   *
   * @param _amount is the amount of WKCS in Juels that should be withdrawn.
   */
  function withdraw(address _recipient, uint256 _amount) external onlyOwner {
    WRAPPER_TOKEN.transfer(_recipient, _amount);
  }

  /**
   * @notice enable this contract so that new requests can be accepted.
   */
  function enable() external onlyOwner {
    s_disabled = false;
  }

  /**
   * @notice disable this contract so that new requests will be rejected. When disabled, new requests
   * @notice will revert but existing requests can still be fulfilled.
   */
  function disable() external onlyOwner {
    s_disabled = true;
  }

  function fulfillRandomWords(uint256 _requestId, uint256[] memory _randomWords) internal override {
    Callback memory callback = s_callbacks[_requestId];
    delete s_callbacks[_requestId];
    require(callback.callbackAddress != address(0), "request not found"); // This should never happen

    VRFV2WrapperConsumerBase c;
    bytes memory resp = abi.encodeWithSelector(c.rawFulfillRandomWords.selector, _requestId, _randomWords);

    bool success = callWithExactGas(callback.callbackGasLimit, callback.callbackAddress, resp);
    if (!success) {
      emit WrapperFulfillmentFailed(_requestId, callback.callbackAddress);
    }
  }

  /**
   * @dev Calculates extra amount of gas required for running an assembly call() post-EIP150.
   */
  function getEIP150Overhead(uint32 gas) private pure returns (uint32) {
    return gas / 63 + 1;
  }

  /**
   * @dev calls target address with exactly gasAmount gas and data as calldata
   * or reverts if at least gasAmount gas is not available.
   */
  function callWithExactGas(
    uint256 gasAmount,
    address target,
    bytes memory data
  ) private returns (bool success) {
    // solhint-disable-next-line no-inline-assembly
    assembly {
      let g := gas()
      // Compute g -= GAS_FOR_CALL_EXACT_CHECK and check for underflow
      // The gas actually passed to the callee is min(gasAmount, 63//64*gas available).
      // We want to ensure that we revert if gasAmount >  63//64*gas available
      // as we do not want to provide them with less, however that check itself costs
      // gas.  GAS_FOR_CALL_EXACT_CHECK ensures we have at least enough gas to be able
      // to revert if gasAmount >  63//64*gas available.
      if lt(g, GAS_FOR_CALL_EXACT_CHECK) {
        revert(0, 0)
      }
      g := sub(g, GAS_FOR_CALL_EXACT_CHECK)
      // if g - g//64 <= gasAmount, revert
      // (we subtract g//64 because of EIP-150)
      if iszero(gt(sub(g, div(g, 64)), gasAmount)) {
        revert(0, 0)
      }
      // solidity calls check that a contract actually exists at the destination, so we do the same
      if iszero(extcodesize(target)) {
        revert(0, 0)
      }
      // call and return whether we succeeded. ignore return data
      // call(gas,addr,value,argsOffset,argsLength,retOffset,retLength)
      success := call(gasAmount, target, 0, add(data, 0x20), mload(data), 0, 0)
    }
    return success;
  }

  function typeAndVersion() external pure virtual override returns (string memory) {
    return "VRFV2Wrapper 1.0.0";
  }

  modifier onlyConfiguredNotDisabled() {
    require(s_configured, "wrapper is not configured");
    require(!s_disabled, "wrapper is disabled");
    _;
  }
}

interface ExtendedVRFCoordinatorV2Interface is VRFCoordinatorV2Interface {
  function getConfig()
    external
    view
    returns (
      uint16 minimumRequestConfirmations,
      uint32 maxGasLimit,
      uint32 gasAfterPaymentCalculation,
      bool paymentEnabled,
      uint32 fulfillmentFlatFeePPM
    );
}
