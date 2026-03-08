import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getIntent, saveIntent } from "@/lib/intentStore";

const createSchema = z.object({
  transferId: z.string().regex(/^\d+$/),
  phone: z.string().min(10),
  phoneHash: z.string().startsWith("0x").length(66),
});

export async function POST(request: NextRequest) {
  try {
    const body = createSchema.parse(await request.json());

    saveIntent({
      transferId: body.transferId,
      phone: body.phone,
      phoneHash: body.phoneHash.toLowerCase(),
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}

export async function GET(request: NextRequest) {
  const transferId = request.nextUrl.searchParams.get("transferId");
  const phoneHash = request.nextUrl.searchParams.get("phoneHash")?.toLowerCase();

  if (!transferId) {
    return NextResponse.json({ error: "transferId is required" }, { status: 400 });
  }

  const intent = getIntent(transferId);
  if (!intent) {
    return NextResponse.json({ error: "Intent not found" }, { status: 404 });
  }

  if (phoneHash && intent.phoneHash !== phoneHash) {
    return NextResponse.json({ error: "phoneHash mismatch" }, { status: 403 });
  }

  return NextResponse.json({
    transferId: intent.transferId,
    phone: intent.phone,
    createdAt: intent.createdAt,
  });
}
