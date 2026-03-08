export const MOMO_SETTLEMENT_ABI = [
  "function requestTransfer(bytes32 phoneHash,uint256 usdcAmount) returns (uint256)",
  "function transfers(uint256) view returns (address sender, bytes32 phoneHash, uint256 usdcAmount, uint256 ghsAmount, uint256 fxRate, bool settled, bool refunded)",
  "event TransferRequested(uint256 indexed id,address indexed sender,uint256 usdcAmount,bytes32 phoneHash)",
] as const;

export const ERC20_ABI = [
  "function approve(address spender,uint256 amount) returns (bool)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
] as const;
