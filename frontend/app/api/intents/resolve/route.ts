import { NextRequest, NextResponse } from "next/server";
import { getIntent } from "@/lib/intentStore";

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
  });
}
