export const momoAbi = [
  {
    type: "event",
    name: "TransferRequested",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "sender", type: "address", indexed: true },
      { name: "usdcAmount", type: "uint256", indexed: false },
      { name: "phoneHash", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "function",
    name: "confirmSettlement",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "ghsAmount", type: "uint256" },
      { name: "fxRate", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "refundTransfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "reason", type: "string" },
    ],
    outputs: [],
  },
] as const;