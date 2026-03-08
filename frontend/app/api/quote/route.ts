import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const payloadSchema = z.object({
  usdcAmount: z.string().regex(/^\d+$/),
});

type FxPayload = {
  rates?: Record<string, number>;
  info?: { rate?: number };
};

export async function POST(request: NextRequest) {
  try {
    const body = payloadSchema.parse(await request.json());
    const usdcAmount = BigInt(body.usdcAmount);

    const response = await fetch("https://open.er-api.com/v6/latest/USD", {
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json({ error: "FX provider unavailable" }, { status: 502 });
    }

    const payload = (await response.json()) as FxPayload;
    const rate = payload.rates?.GHS ?? payload.info?.rate;
    if (!rate || rate <= 0) {
      return NextResponse.json({ error: "USD/GHS unavailable" }, { status: 502 });
    }

    const fxRate8 = BigInt(Math.round(rate * 100_000_000));
    const ghsAmount8 = (usdcAmount * fxRate8) / 1_000_000n;

    return NextResponse.json({
      rate,
      fxRate8: fxRate8.toString(),
      ghsAmount8: ghsAmount8.toString(),
    });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
