// app/api/shares/route.ts  — 最小エコー版（常に200）
import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const hdr = req.headers.get("x-dev-auth") || null;
  const hasEnv = !!process.env.SHARE_DEV_BYPASS_TOKEN;
  // ここでは常に 200 を返す（到達確認のため）
  return NextResponse.json({ ok: true, step: "echo-min", hdr, hasEnv }, { status: 200 });
}
