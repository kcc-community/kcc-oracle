// SPDX-License-Identifier: MIT
// Example of a single consumer contract which owns the subscription.
pragma solidity ^0.8.0;

import "../VRFV2WrapperConsumerBase.sol";
import "../ConfirmedOwner.sol";

/**
 * THIS IS AN EXAMPLE CONTRACT THAT USES HARDCODED VALUES FOR CLARITY.
 * THIS IS AN EXAMPLE CONTRACT THAT USES UN-AUDITED CODE.
 * DO NOT USE THIS CODE IN PRODUCTION.
 */

contract VRFDirectFundingExampleV2 is VRFV2WrapperConsumerBase, ConfirmedOwner {
  event RequestSent(uint256 requestId, uint32 numWords);
  event RequestFulfilled(uint256 requestId, uint256[] randomWords, uint256 payment);

  struct RequestStatus {
    uint256 paid; // amount paid in wkcs
    bool fulfilled; // whether the request has been successfully fulfilled
    uint256[] randomWords;
  }
  mapping(uint256 => RequestStatus) public s_requests; /* requestId --> requestStatus */

  // past requests Id.
  uint256[] public requestIds;
  uint256 public lastRequestId;

  address wrappedTokenAddress;

  address vrfWrapperAddress;

  struct VRFConfig {
    uint16 requestConfirmations;
    uint32 callbackGasLimit;
    uint32 numWords;
  }
  VRFConfig private s_config;

  event VRFConfigSet(uint16 requestConfirmations, uint32 callbackGasLimit, uint32 numWords);

  constructor(address _wrapperToken, address _vrfWrapper)
    ConfirmedOwner(msg.sender)
    VRFV2WrapperConsumerBase(_wrapperToken, _vrfWrapper)
  {
    wrappedTokenAddress = _wrapperToken;
    vrfWrapperAddress = _vrfWrapper;
  }

  /**
   * @notice Sets the configuration of the vrf
   * @param _requestConfirmations the default is 3, but you can set this higher.
   * @param _callbackGasLimit depends on the number of requested values that you want sent to the
   * fulfillRandomWords() function. Storing each word costs about 20,000 gas,
   * so 100,000 is a safe default for this example contract. Test and adjust
   * this limit based on the network that you select, the size of the request,
   * and the processing of the callback request in the fulfillRandomWords()
   * function.
   * @param _numWords - The number of uint256 random values you'd like to receive
   * in your fulfillRandomWords callback. Note these numbers are expanded in a
   * secure way by the VRFCoordinator from a single random value supplied by the oracle.
   */
  function setVRFConfig(
    uint16 _requestConfirmations,
    uint32 _callbackGasLimit,
    uint32 _numWords
  ) external onlyOwner {
    s_config = VRFConfig({
      requestConfirmations: _requestConfirmations,
      callbackGasLimit: _callbackGasLimit,
      numWords: _numWords
    });
    emit VRFConfigSet(_requestConfirmations, _callbackGasLimit, _numWords);
  }

  function getVRFConfig()
    external
    view
    returns (
      uint16 requestConfirmations,
      uint32 maxGasLimit,
      uint32 numWords
    )
  {
    return (s_config.requestConfirmations, s_config.callbackGasLimit, s_config.numWords);
  }

  function requestRandomWords() external onlyOwner returns (uint256 requestId) {
    requestId = requestRandomness(s_config.callbackGasLimit, s_config.requestConfirmations, s_config.numWords);
    s_requests[requestId] = RequestStatus({
      paid: VRF_WRAPPER.calculateRequestPrice(s_config.callbackGasLimit),
      randomWords: new uint256[](0),
      fulfilled: false
    });
    requestIds.push(requestId);
    lastRequestId = requestId;
    emit RequestSent(requestId, s_config.numWords);
    return requestId;
  }

  function fulfillRandomWords(uint256 _requestId, uint256[] memory _randomWords) internal override {
    require(s_requests[_requestId].paid > 0, "request not found");
    s_requests[_requestId].fulfilled = true;
    s_requests[_requestId].randomWords = _randomWords;
    emit RequestFulfilled(_requestId, _randomWords, s_requests[_requestId].paid);
  }

  function getRequestStatus(uint256 _requestId)
    external
    view
    returns (
      uint256 paid,
      bool fulfilled,
      uint256[] memory randomWords
    )
  {
    require(s_requests[_requestId].paid > 0, "request not found");
    RequestStatus memory request = s_requests[_requestId];
    return (request.paid, request.fulfilled, request.randomWords);
  }

  /**
   * Allow withdraw of wkcs tokens from the contract
   */
  function withdrawToken() public onlyOwner {
    WrappedNativeInterface wrappedNative = WrappedNativeInterface(wrappedTokenAddress);
    require(wrappedNative.transfer(msg.sender, wrappedNative.balanceOf(address(this))), "Unable to transfer");
  }
}
