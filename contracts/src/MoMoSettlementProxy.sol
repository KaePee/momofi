// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReceiverTemplate} from "./ReceiverTemplate.sol";

contract MoMoSettlementProxy is ReceiverTemplate {
    address public moMoSettlementAddress;

    error CallFailed(bytes data);

    constructor(
        address _forwarderAddress,
        address _moMoSettlementAddress
    ) ReceiverTemplate(_forwarderAddress) {
        moMoSettlementAddress = _moMoSettlementAddress;
    }

    /// @notice Updates the logic contract address
    /// @param _moMoSettlementAddress The new MoMoSettlement contract address
    function setMoMoSettlementAddress(address _moMoSettlementAddress) external onlyOwner {
        moMoSettlementAddress = _moMoSettlementAddress;
    }

    /// @inheritdoc ReceiverTemplate
    function _processReport(bytes calldata report) internal override {
        // The report contains the exact ABI-encoded function call
        // (i.e. confirmSettlement or refundTransfer) with its arguments.
        (bool success, bytes memory returnData) = moMoSettlementAddress.call(report);
        if (!success) {
            revert CallFailed(returnData);
        }
    }
}
