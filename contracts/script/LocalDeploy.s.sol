// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {MoMoSettlement} from "../src/MoMoSettlement.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import "forge-std/console.sol";

contract LocalDeployScript is Script {
    function run() external {
        // Default Anvil key #0
        uint256 deployerPrivateKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
        address deployerAddress = vm.addr(deployerPrivateKey);
        
        // Use Anvil key #1 for CRE Executor
        uint256 executorPrivateKey = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;
        address executorAddress = vm.addr(executorPrivateKey);

        vm.startBroadcast(deployerAddress);
        // 1. Deploy Mock USDC
        MockUSDC usdc = new MockUSDC();
        console.log("MockUSDC deployed at:", address(usdc));

        // 2. Deploy MoMoSettlement
        // Price feed is address(0) to bypass FX rate check locally (uses 1:1 fallback in contract if address(0))
        MoMoSettlement settlement = new MoMoSettlement(address(usdc), executorAddress, address(0));
        console.log("MoMoSettlement deployed at:", address(settlement));

        // 3. Mint some USDC to the deployer so we can test it from the frontend
        // Deployer already gets 1,000,000 USDC in MockUSDC constructor, but let's be explicit
        // or mint to a specific wallet if needed. Let's assume frontend uses account #0.
        
        vm.stopBroadcast();
    }
}
