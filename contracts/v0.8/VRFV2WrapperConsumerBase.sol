// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/VRFV2WrapperInterface.sol";
import "./interfaces/WrappedNativeInterface.sol";

/** *******************************************************************************
 * @notice Interface for contracts using VRF randomness through the VRF V2 wrapper
 * ********************************************************************************
 * @dev PURPOSE
 *
 * @dev Create VRF V2 requests without the need for subscription management. Rather than creating
 * @dev and funding a VRF V2 subscription, a user can use this wrapper to create one off requests,
 * @dev paying up front rather than at fulfillment.
 *
 * @dev Since the price is determined using the gas price of the request transaction rather than
 * @dev the fulfillment transaction, the wrapper charges an additional premium on callback gas
 * @dev usage, in addition to some extra overhead costs associated with the VRFV2Wrapper contract.
 * *****************************************************************************
 * @dev USAGE
 *
 * @dev Calling contracts must inherit from VRFV2WrapperConsumerBase. The consumer must be funded
 * @dev with enough WKCS to make the request, otherwise requests will revert. To request randomness,
 * @dev call the 'requestRandomness' function with the desired VRF parameters. This function handles
 * @dev paying for the request based on the current pricing.
 *
 * @dev Consumers must implement the fullfillRandomWords function, which will be called during
 * @dev fulfillment with the randomness result.
 */
abstract contract VRFV2WrapperConsumerBase {
  WrappedNativeInterface internal immutable WRAPPER_TOKEN;
  VRFV2WrapperInterface internal immutable VRF_WRAPPER;

  /**
   * @param _wrapperToken is the address of WrapperToken
   * @param _vrfWrapper is the address of the VRFV2Wrapper contract
   */
  constructor(address _wrapperToken, address _vrfWrapper) {
    WRAPPER_TOKEN = WrappedNativeInterface(_wrapperToken);
    VRF_WRAPPER = VRFV2WrapperInterface(_vrfWrapper);
  }

  /**
   * @dev Requests randomness from the VRF V2 wrapper.
   *
   * @param _callbackGasLimit is the gas limit that should be used when calling the consumer's
   *        fulfillRandomWords function.
   * @param _requestConfirmations is the number of confirmations to wait before fulfilling the
   *        request. A higher number of confirmations increases security by reducing the likelihood
   *        that a chain re-org changes a published randomness outcome.
   * @param _numWords is the number of random words to request.
   *
   * @return requestId is the VRF V2 request ID of the newly created randomness request.
   */
  function requestRandomness(
    uint32 _callbackGasLimit,
    uint16 _requestConfirmations,
    uint32 _numWords
  ) internal returns (uint256 requestId) {
    uint256 amount;
    if (VRF_WRAPPER.paymentEnabled()) {
      amount = VRF_WRAPPER.calculateRequestPrice(_callbackGasLimit);
      WRAPPER_TOKEN.approve(address(VRF_WRAPPER), amount);
    }
    requestId = VRF_WRAPPER.requestRandomness(amount, _callbackGasLimit, _requestConfirmations, _numWords);
    return requestId;
  }

  /**
   * @notice fulfillRandomWords handles the VRF V2 wrapper response. The consuming contract must
   * @notice implement it.
   *
   * @param _requestId is the VRF V2 request ID.
   * @param _randomWords is the randomness result.
   */
  function fulfillRandomWords(uint256 _requestId, uint256[] memory _randomWords) internal virtual;

  function rawFulfillRandomWords(uint256 _requestId, uint256[] memory _randomWords) external {
    require(msg.sender == address(VRF_WRAPPER), "only VRF V2 wrapper can fulfill");
    fulfillRandomWords(_requestId, _randomWords);
  }
}
