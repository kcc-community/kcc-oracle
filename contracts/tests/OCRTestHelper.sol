// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

interface OCRInterface {
  function latestTransmissionDetails()
    external
    view
    returns (
      address currentTransmitter,
      address nextTransmitter,
      uint8 nextIndex,
      uint256 transmittersLength,
      uint80 roundId,
      int192 answer,
      uint256 startedAt,
      uint256 updatedAt
    );
}

contract OCRTestHelper {
  OCRInterface public immutable AGGREGATOR;

  constructor(address feedAddress) {
    AGGREGATOR = OCRInterface(feedAddress);
  }

  function latestTransmissionDetails()
    external
    view
    returns (
      address currentTransmitter,
      address nextTransmitter,
      uint8 nextIndex,
      uint256 transmittersLength,
      uint80 roundId,
      int192 answer,
      uint256 startedAt,
      uint256 updatedAt
    )
  {
    return AGGREGATOR.latestTransmissionDetails();
  }
}
