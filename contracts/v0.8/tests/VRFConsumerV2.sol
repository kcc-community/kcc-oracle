// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../interfaces/WrappedNativeInterface.sol";
import "../interfaces/VRFCoordinatorV2Interface.sol";
import "../VRFConsumerBaseV2.sol";

contract VRFConsumerV2 is VRFConsumerBaseV2 {
  uint256[] public s_randomWords;
  uint256 public s_requestId;
  VRFCoordinatorV2Interface COORDINATOR;
  WrappedNativeInterface WRAPPER_TOKEN;
  uint64 public s_subId;
  uint256 public s_gasAvailable;

  constructor(address vrfCoordinator, address _wrapperToken) VRFConsumerBaseV2(vrfCoordinator) {
    COORDINATOR = VRFCoordinatorV2Interface(vrfCoordinator);
    WRAPPER_TOKEN = WrappedNativeInterface(_wrapperToken);
  }

  function fulfillRandomWords(uint256 requestId, uint256[] memory randomWords) internal override {
    require(requestId == s_requestId, "request ID is incorrect");

    s_gasAvailable = gasleft();
    s_randomWords = randomWords;
  }

  function updateSubscription(address[] memory consumers) external {
    require(s_subId != 0, "subID not set");
    for (uint256 i = 0; i < consumers.length; i++) {
      COORDINATOR.addConsumer(s_subId, consumers[i]);
    }
  }

  function testRequestRandomness(
    bytes32 keyHash,
    uint64 subId,
    uint16 minReqConfs,
    uint32 callbackGasLimit,
    uint32 numWords
  ) external returns (uint256) {
    s_requestId = COORDINATOR.requestRandomWords(keyHash, subId, minReqConfs, callbackGasLimit, numWords);
    return s_requestId;
  }
}
