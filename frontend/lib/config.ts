export const appConfig = {
  chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 31337),
  settlementAddress: process.env.NEXT_PUBLIC_MOMO_SETTLEMENT_ADDRESS ?? "",
  usdcAddress: process.env.NEXT_PUBLIC_USDC_ADDRESS ?? "",
  intentApiBase: process.env.NEXT_PUBLIC_INTENT_API_BASE ?? "",
  thirdwebClientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID ?? "",
};

export function requiredAddress(value: string, key: string): `0x${string}` {
  if (!value || !value.startsWith("0x")) {
    throw new Error(`${key} is missing or invalid`);
  }
  return value as `0x${string}`;
}
