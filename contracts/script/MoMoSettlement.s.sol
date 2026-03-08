// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {MoMoSettlement} from "../src/MoMoSettlement.sol";

contract MoMoSettlementScript is Script {
    function run() external returns (MoMoSettlement deployed) {
        address usdc = vm.envAddress("USDC_ADDRESS");
        address executor = vm.envAddress("CRE_EXECUTOR");
        address priceFeed = vm.envOr("FX_PRICE_FEED", address(0));

        vm.startBroadcast();
        deployed = new MoMoSettlement(usdc, executor, priceFeed);
        vm.stopBroadcast();
    }
}
