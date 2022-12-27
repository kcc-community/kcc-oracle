// SPDX-License-Identifier: MIT
// Example of a single consumer contract which owns the subscription.
pragma solidity ^0.8.0;

import "../interfaces/VRFCoordinatorV2Interface.sol";
import "../VRFConsumerBaseV2.sol";
import "../ConfirmedOwner.sol";

contract VRFSubscriptionExampleV2 is VRFConsumerBaseV2, ConfirmedOwner {
  event RequestSent(uint256 requestId, uint32 numWords);
  event RequestFulfilled(uint256 requestId, uint256[] randomWords);

  struct RequestStatus {
    bool fulfilled; // whether the request has been successfully fulfilled
    bool exists; // whether a requestId exists
    uint256[] randomWords;
  }
  mapping(uint256 => RequestStatus) public s_requests; /* requestId --> requestStatus */
  VRFCoordinatorV2Interface public COORDINATOR;

  // past requests Id.
  uint256[] public requestIds;
  uint256 public lastRequestId;

  struct VRFConfig {
    uint64 subId;
    uint16 requestConfirmations;
    uint32 callbackGasLimit;
    uint32 numWords;
    bytes32 keyHash;
  }
  VRFConfig private s_config;

  event VRFConfigSet(
    uint64 subId,
    uint16 requestConfirmations,
    uint32 callbackGasLimit,
    uint32 numWords,
    bytes32 keyHash
  );

  constructor(address _vrfCoordinator) VRFConsumerBaseV2(_vrfCoordinator) ConfirmedOwner(msg.sender) {
    COORDINATOR = VRFCoordinatorV2Interface(_vrfCoordinator);
  }

  /**
   * @notice Sets the configuration of the vrf
   * @param _subId  - The ID of the VRF subscription. Must be funded
   * with the minimum subscription balance required for the selected keyHash.
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
   * @param _keyHash - Corresponds to a particular oracle job which uses
   * that key for generating the VRF proof. Different keyHash's have different gas price
   * ceilings, so you can select a specific one to bound your maximum per request cost.
   */
  function setVRFConfig(
    uint64 _subId,
    uint16 _requestConfirmations,
    uint32 _callbackGasLimit,
    uint32 _numWords,
    bytes32 _keyHash
  ) external onlyOwner {
    s_config = VRFConfig({
      subId: _subId,
      requestConfirmations: _requestConfirmations,
      callbackGasLimit: _callbackGasLimit,
      numWords: _numWords,
      keyHash: _keyHash
    });
    emit VRFConfigSet(_subId, _requestConfirmations, _callbackGasLimit, _numWords, _keyHash);
  }

  function getVRFConfig()
    external
    view
    returns (
      uint64 subId,
      uint16 requestConfirmations,
      uint32 maxGasLimit,
      uint32 numWords,
      bytes32 keyHash
    )
  {
    return (
      s_config.subId,
      s_config.requestConfirmations,
      s_config.callbackGasLimit,
      s_config.numWords,
      s_config.keyHash
    );
  }

  // Assumes the subscription is funded sufficiently.
  function requestRandomWords() external onlyOwner returns (uint256 requestId) {
    // Will revert if subscription is not set and funded.
    requestId = COORDINATOR.requestRandomWords(
      s_config.keyHash,
      s_config.subId,
      s_config.requestConfirmations,
      s_config.callbackGasLimit,
      s_config.numWords
    );
    s_requests[requestId] = RequestStatus({randomWords: new uint256[](0), exists: true, fulfilled: false});
    requestIds.push(requestId);
    lastRequestId = requestId;
    emit RequestSent(requestId, s_config.numWords);
    return requestId;
  }

  function fulfillRandomWords(uint256 _requestId, uint256[] memory _randomWords) internal override {
    require(s_requests[_requestId].exists, "request not found");
    s_requests[_requestId].fulfilled = true;
    s_requests[_requestId].randomWords = _randomWords;
    emit RequestFulfilled(_requestId, _randomWords);
  }

  function getRequestStatus(uint256 _requestId) external view returns (bool fulfilled, uint256[] memory randomWords) {
    require(s_requests[_requestId].exists, "request not found");
    RequestStatus memory request = s_requests[_requestId];
    return (request.fulfilled, request.randomWords);
  }
}
