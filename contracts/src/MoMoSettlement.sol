// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function transfer(address to, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface AggregatorV3Interface {
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);

    function decimals() external view returns (uint8);
}

contract MoMoSettlement {
    struct Transfer {
        address sender;
        bytes32 phoneHash;
        uint256 usdcAmount;
        uint256 ghsAmount;
        uint256 fxRate; // GHS per USD, 8 decimals
        bool settled;
        bool refunded;
    }

    event TransferRequested(uint256 indexed id, address indexed sender, uint256 usdcAmount, bytes32 phoneHash);
    event SettlementCompleted(uint256 indexed id, uint256 ghsAmount, uint256 fxRate);
    event SettlementFailed(uint256 indexed id, string reason);
    event Refunded(uint256 indexed id);
    event CREExecutorUpdated(address indexed newExecutor);
    event PriceFeedUpdated(address indexed newPriceFeed);
    event MaxSlippageBpsUpdated(uint256 newMaxSlippageBps);

    error Unauthorized();
    error InvalidAmount();
    error InvalidTransferId();
    error AlreadySettled();
    error AlreadyRefunded();
    error InvalidRate();
    error SlippageExceeded();
    error TransferFailed();

    mapping(uint256 => Transfer) public transfers;
    uint256 public transferCounter;

    IERC20 public immutable usdc;
    address public proxyAddress;
    address public owner;

    AggregatorV3Interface public priceFeed;
    uint256 public maxSlippageBps = 100; // 1%

    uint256 private _locked = 1;

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyProxy() {
        if (msg.sender != proxyAddress) revert Unauthorized();
        _;
    }

    modifier nonReentrant() {
        require(_locked == 1, "REENTRANCY");
        _locked = 2;
        _;
        _locked = 1;
    }

    constructor(address usdcToken, address _proxyAddress, address fxFeed) {
        require(usdcToken != address(0), "USDC_ZERO");
        require(_proxyAddress != address(0), "PROXY_ZERO");

        usdc = IERC20(usdcToken);
        owner = msg.sender;
        proxyAddress = _proxyAddress;

        if (fxFeed != address(0)) {
            priceFeed = AggregatorV3Interface(fxFeed);
        }
    }

    function setProxyAddress(address newProxyAddress) external onlyOwner {
        require(newProxyAddress != address(0), "PROXY_ZERO");
        emit CREExecutorUpdated(newProxyAddress); // Keeping event name for compatibility or you can change it
        proxyAddress = newProxyAddress;
    }

    function setPriceFeed(address newPriceFeed) external onlyOwner {
        priceFeed = AggregatorV3Interface(newPriceFeed);
        emit PriceFeedUpdated(newPriceFeed);
    }

    function setMaxSlippageBps(uint256 newMaxSlippageBps) external onlyOwner {
        require(newMaxSlippageBps <= 1_000, "SLIPPAGE_TOO_HIGH");
        maxSlippageBps = newMaxSlippageBps;
        emit MaxSlippageBpsUpdated(newMaxSlippageBps);
    }

    function requestTransfer(bytes32 phoneHash, uint256 usdcAmount) external nonReentrant returns (uint256 id) {
        if (usdcAmount == 0) revert InvalidAmount();

        id = ++transferCounter;

        transfers[id] = Transfer({
            sender: msg.sender,
            phoneHash: phoneHash,
            usdcAmount: usdcAmount,
            ghsAmount: 0,
            fxRate: 0,
            settled: false,
            refunded: false
        });

        _safeTransferFrom(usdc, msg.sender, address(this), usdcAmount);

        emit TransferRequested(id, msg.sender, usdcAmount, phoneHash);
    }

    function confirmSettlement(uint256 id, uint256 ghsAmount, uint256 fxRate) external onlyProxy nonReentrant {
        if (id == 0 || id > transferCounter) revert InvalidTransferId();
        if (ghsAmount == 0 || fxRate == 0) revert InvalidAmount();

        Transfer storage t = transfers[id];
        if (t.settled) revert AlreadySettled();
        if (t.refunded) revert AlreadyRefunded();

        _checkSlippageAgainstFeed(fxRate);

        t.ghsAmount = ghsAmount;
        t.fxRate = fxRate;
        t.settled = true;

        emit SettlementCompleted(id, ghsAmount, fxRate);
    }

    function refundTransfer(uint256 id, string calldata reason) external onlyProxy nonReentrant {
        if (id == 0 || id > transferCounter) revert InvalidTransferId();

        Transfer storage t = transfers[id];
        if (t.settled) revert AlreadySettled();
        if (t.refunded) revert AlreadyRefunded();

        t.refunded = true;
        _safeTransfer(usdc, t.sender, t.usdcAmount);

        emit SettlementFailed(id, reason);
        emit Refunded(id);
    }

    function getLatestFxRate() external view returns (uint256) {
        if (address(priceFeed) == address(0)) revert InvalidRate();

        (, int256 answer,,,) = priceFeed.latestRoundData();
        if (answer <= 0) revert InvalidRate();

        uint8 decimals = priceFeed.decimals();
        if (decimals == 8) {
            return uint256(answer);
        }
        if (decimals > 8) {
            return uint256(answer) / (10 ** (decimals - 8));
        }
        return uint256(answer) * (10 ** (8 - decimals));
    }

    function _checkSlippageAgainstFeed(uint256 executionRate) internal view {
        if (address(priceFeed) == address(0)) {
            return;
        }

        (, int256 answer,,,) = priceFeed.latestRoundData();
        if (answer <= 0) revert InvalidRate();

        uint8 decimals = priceFeed.decimals();
        uint256 normalized;
        if (decimals == 8) {
            normalized = uint256(answer);
        } else if (decimals > 8) {
            normalized = uint256(answer) / (10 ** (decimals - 8));
        } else {
            normalized = uint256(answer) * (10 ** (8 - decimals));
        }

        uint256 diff = executionRate > normalized ? executionRate - normalized : normalized - executionRate;

        if (diff * 10_000 > normalized * maxSlippageBps) revert SlippageExceeded();
    }

    function _safeTransferFrom(IERC20 token, address from, address to, uint256 amount) internal {
        (bool ok, bytes memory data) =
            address(token).call(abi.encodeWithSelector(token.transferFrom.selector, from, to, amount));

        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) {
            revert TransferFailed();
        }
    }

    function _safeTransfer(IERC20 token, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = address(token).call(abi.encodeWithSelector(token.transfer.selector, to, amount));

        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) {
            revert TransferFailed();
        }
    }
}
