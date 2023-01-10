// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../VRFCoordinatorV2.sol";

contract VRFCoordinatorV2TestHelper is VRFCoordinatorV2 {
  uint256 s_paymentAmount;
  uint256 s_gasStart;

  constructor(address wrapperNativeToken, address blockhashStore)
    // solhint-disable-next-line no-empty-blocks
    VRFCoordinatorV2(wrapperNativeToken, blockhashStore)
  {
    /* empty */
  }

  function calculatePaymentAmountTest(
    uint256 gasAfterPaymentCalculation,
    uint32 fulfillmentFlatFeePPM,
    uint256 weiPerUnitGas
  ) external {
    s_paymentAmount = calculatePaymentAmount(
      gasleft(),
      gasAfterPaymentCalculation,
      fulfillmentFlatFeePPM,
      weiPerUnitGas
    );
  }

  function getPaymentAmount() public view returns (uint256) {
    return s_paymentAmount;
  }

  function getGasStart() public view returns (uint256) {
    return s_gasStart;
  }
}
