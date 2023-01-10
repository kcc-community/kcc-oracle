// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface VRFV2WrapperInterface {
  /**
   * @return Whether the subscriber needs to pay a fee to the oracle
   */
  function paymentEnabled() external view returns (bool);

  /**
   * @notice Calculates the price of a VRF request with the given callbackGasLimit at the current
   * @notice block.
   *
   * @dev This function relies on the transaction gas price which is not automatically set during
   * @dev simulation. To estimate the price at a specific gas price, use the estimatePrice function.
   *
   * @param _callbackGasLimit is the gas limit used to estimate the price.
   */
  function calculateRequestPrice(uint32 _callbackGasLimit) external view returns (uint256);

  /**
   * @notice Estimates the price of a VRF request with a specific gas limit and gas price.
   *
   * @dev This is a convenience function that can be called in simulation to better understand
   * @dev pricing.
   *
   * @param _callbackGasLimit is the gas limit used to estimate the price.
   * @param _requestGasPriceWei is the gas price in wei used for the estimation.
   */
  function estimateRequestPrice(uint32 _callbackGasLimit, uint256 _requestGasPriceWei) external view returns (uint256);

  function requestRandomness(
    uint256 amount,
    uint32 callbackGasLimit,
    uint16 minimumRequestConfirmations,
    uint32 numWords
  ) external returns (uint256 requestId);
}
