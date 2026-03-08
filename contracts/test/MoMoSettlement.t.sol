// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MoMoSettlement, AggregatorV3Interface} from "../src/MoMoSettlement.sol";

contract MockERC20 {
    string public name = "Mock USDC";
    string public symbol = "mUSDC";
    uint8 public decimals = 6;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "BALANCE");
        unchecked {
            balanceOf[msg.sender] -= amount;
            balanceOf[to] += amount;
        }
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "ALLOWANCE");
        require(balanceOf[from] >= amount, "BALANCE");

        unchecked {
            allowance[from][msg.sender] = allowed - amount;
            balanceOf[from] -= amount;
            balanceOf[to] += amount;
        }
        return true;
    }
}

contract MockFeed is AggregatorV3Interface {
    int256 private _answer;
    uint8 private _decimals;

    constructor(int256 answer_, uint8 decimals_) {
        _answer = answer_;
        _decimals = decimals_;
    }

    function setAnswer(int256 answer_) external {
        _answer = answer_;
    }

    function latestRoundData() external view override returns (uint80, int256, uint256, uint256, uint80) {
        return (0, _answer, 0, block.timestamp, 0);
    }

    function decimals() external view override returns (uint8) {
        return _decimals;
    }
}

contract MoMoSettlementTest is Test {
    MockERC20 internal usdc;
    MockFeed internal feed;
    MoMoSettlement internal settlement;

    address internal owner = address(this);
    address internal executor = address(0xBEEF);
    address internal alice = address(0xA11CE);
    bytes32 internal phoneHash = keccak256("+233244123456");

    function setUp() public {
        owner;

        usdc = new MockERC20();
        feed = new MockFeed(10e8, 8);
        settlement = new MoMoSettlement(address(usdc), executor, address(feed));

        usdc.mint(alice, 1_000_000_000); // 1,000 USDC with 6 decimals

        vm.prank(alice);
        usdc.approve(address(settlement), type(uint256).max);
    }

    function testRequestTransferStoresIntentAndEscrowsUSDC() public {
        vm.prank(alice);
        uint256 id = settlement.requestTransfer(phoneHash, 250e6);

        assertEq(id, 1);
        assertEq(usdc.balanceOf(address(settlement)), 250e6);

        (
            address sender,
            bytes32 savedPhoneHash,
            uint256 usdcAmount,
            uint256 ghsAmount,
            uint256 fxRate,
            bool settled,
            bool refunded
        ) = settlement.transfers(id);

        assertEq(sender, alice);
        assertEq(savedPhoneHash, phoneHash);
        assertEq(usdcAmount, 250e6);
        assertEq(ghsAmount, 0);
        assertEq(fxRate, 0);
        assertFalse(settled);
        assertFalse(refunded);
    }

    function testConfirmSettlementOnlyExecutor() public {
        vm.prank(alice);
        uint256 id = settlement.requestTransfer(phoneHash, 100e6);

        vm.expectRevert(MoMoSettlement.Unauthorized.selector);
        settlement.confirmSettlement(id, 1_000e8, 10e8);

        vm.prank(executor);
        settlement.confirmSettlement(id, 1_000e8, 10e8);

        (,,, uint256 ghsAmount, uint256 fxRate, bool settled, bool refunded) = settlement.transfers(id);
        assertEq(ghsAmount, 1_000e8);
        assertEq(fxRate, 10e8);
        assertTrue(settled);
        assertFalse(refunded);
    }

    function testConfirmSettlementCannotBeCalledTwice() public {
        vm.prank(alice);
        uint256 id = settlement.requestTransfer(phoneHash, 100e6);

        vm.prank(executor);
        settlement.confirmSettlement(id, 1_000e8, 10e8);

        vm.prank(executor);
        vm.expectRevert(MoMoSettlement.AlreadySettled.selector);
        settlement.confirmSettlement(id, 1_000e8, 10e8);
    }

    function testRefundTransferReturnsUSDC() public {
        vm.prank(alice);
        uint256 id = settlement.requestTransfer(phoneHash, 90e6);

        uint256 aliceBefore = usdc.balanceOf(alice);

        vm.prank(executor);
        settlement.refundTransfer(id, "MTN_DISBURSEMENT_FAILED");

        (,, uint256 usdcAmount,,, bool settled, bool refunded) = settlement.transfers(id);
        assertEq(usdcAmount, 90e6);
        assertFalse(settled);
        assertTrue(refunded);
        assertEq(usdc.balanceOf(alice), aliceBefore + 90e6);
    }

    function testRefundTransferCannotRunAfterSettlement() public {
        vm.prank(alice);
        uint256 id = settlement.requestTransfer(phoneHash, 90e6);

        vm.prank(executor);
        settlement.confirmSettlement(id, 900e8, 10e8);

        vm.prank(executor);
        vm.expectRevert(MoMoSettlement.AlreadySettled.selector);
        settlement.refundTransfer(id, "too_late");
    }

    function testSlippageGuardRevertsWhenFeedDeviationTooHigh() public {
        vm.prank(alice);
        uint256 id = settlement.requestTransfer(phoneHash, 100e6);

        // feed = 10.00, execution = 10.20, default max slippage = 1%
        vm.prank(executor);
        vm.expectRevert(MoMoSettlement.SlippageExceeded.selector);
        settlement.confirmSettlement(id, 1_020e8, 10_20000000);
    }

    function testOwnerCanRelaxSlippageTolerance() public {
        settlement.setMaxSlippageBps(300); // 3%

        vm.prank(alice);
        uint256 id = settlement.requestTransfer(phoneHash, 100e6);

        vm.prank(executor);
        settlement.confirmSettlement(id, 1_020e8, 10_20000000); // 2% deviation now valid

        (,,,,, bool settled,) = settlement.transfers(id);
        assertTrue(settled);
    }

    function testGetLatestFxRateNormalizesDecimals() public {
        assertEq(settlement.getLatestFxRate(), 10e8);

        MockFeed feed18 = new MockFeed(10e18, 18);
        settlement.setPriceFeed(address(feed18));
        assertEq(settlement.getLatestFxRate(), 10e8);
    }
}
