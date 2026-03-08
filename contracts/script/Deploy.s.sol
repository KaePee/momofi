// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {MoMoSettlement} from "../src/MoMoSettlement.sol";
import {MoMoSettlementProxy} from "../src/MoMoSettlementProxy.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract Deploy is Script {
    function run() external {
        address deployerAddress = msg.sender;

        // Fetch configuration from environment, fallback to defaults or Sepolia
        address forwarderAddress = vm.envOr("FORWARDER_ADDRESS", address(0xF8344CFd5c43616a4366C34E3EEE75af79a74482)); // Base Sepolia default for production
        address priceFeed = vm.envOr("PRICE_FEED", address(0)); // Optional

        vm.startBroadcast();

        // 1. Deploy Mock USDC
        MockUSDC usdc = new MockUSDC();
        console.log("MockUSDC deployed to:", address(usdc));

        // 2. Deploy Logic Contract with a temporary zero proxy address
        // We use deployerAddress temporarily so it doesn't fail the constructor address(0) check
        MoMoSettlement settlement = new MoMoSettlement(address(usdc), deployerAddress, priceFeed);
        console.log("MoMoSettlement (Logic) deployed to:", address(settlement));

        // 3. Deploy Proxy Contract
        MoMoSettlementProxy proxy = new MoMoSettlementProxy(forwarderAddress, address(settlement));
        console.log("MoMoSettlementProxy deployed to:", address(proxy));

        // 4. Link Logic Contract to Proxy
        settlement.setProxyAddress(address(proxy));
        console.log("MoMoSettlement successfully linked to proxy");

        // Mint some USDC testing tokens to deployer
        usdc.mint(deployerAddress, 1000 * 10 ** 6);

        vm.stopBroadcast();
        
        console.log("Deployment fully successful!");
        console.log("=====================================");
        console.log("Logic Contract Address:", address(settlement));
        console.log("Proxy Contract Address:", address(proxy));
        console.log("Update CRE config.json with these addresses");
    }
}
