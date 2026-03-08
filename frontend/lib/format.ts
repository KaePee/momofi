export function parseUsdcInput(input: string): bigint {
  const clean = input.trim();
  if (!/^\d+(\.\d{0,6})?$/.test(clean)) {
    throw new Error("Enter a valid USDC amount with up to 6 decimals.");
  }

  const [whole, frac = ""] = clean.split(".");
  const fracPadded = (frac + "000000").slice(0, 6);
  return BigInt(whole) * 1_000_000n + BigInt(fracPadded);
}

export function formatUsdc(amount: bigint): string {
  const whole = amount / 1_000_000n;
  const frac = (amount % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${whole.toString()}.${frac}` : whole.toString();
}

export function formatGhs8(amount: bigint): string {
  const whole = amount / 100_000_000n;
  const frac = (amount % 100_000_000n).toString().padStart(8, "0").slice(0, 2);
  return `${whole.toString()}.${frac}`;
}

export function shortHash(value: string, chars = 6): string {
  if (value.length <= chars * 2) return value;
  return `${value.slice(0, chars)}...${value.slice(-chars)}`;
}
