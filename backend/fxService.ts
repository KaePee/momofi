export type FxQuote = {
  base: "USD";
  quote: "GHS";
  rate: number;
  source: string;
  fetchedAt: string;
};

const FALLBACK_API = "https://open.er-api.com/v6/latest/USD";

export async function fetchUsdToGhsRate(apiUrl: string = FALLBACK_API): Promise<FxQuote> {
  const res = await fetch(apiUrl, { method: "GET" });
  if (!res.ok) {
    throw new Error(`FX API request failed with status ${res.status}`);
  }

  const data = (await res.json()) as {
    rates?: Record<string, number>;
    time_last_update_utc?: string;
  };

  const rate = data.rates?.GHS;
  if (!rate || rate <= 0) {
    throw new Error("USD/GHS rate missing from FX API response");
  }

  return {
    base: "USD",
    quote: "GHS",
    rate,
    source: apiUrl,
    fetchedAt: data.time_last_update_utc ?? new Date().toISOString(),
  };
}

export function computeGhsFromUsdc(usdcAmount: bigint, fxRate: number): bigint {
  const usdcAsUsd = Number(usdcAmount) / 1_000_000;
  const ghsValue = usdcAsUsd * fxRate;

  // Store GHS output using 8 decimals to mirror onchain settlement accounting.
  return BigInt(Math.round(ghsValue * 100_000_000));
}
