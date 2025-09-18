// app/api/drafts/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * TEMP: Draft モデル廃止に伴うビルドエラー回避用スタブ。
 * - 旧 /api/drafts は 410 Gone を返す
 * - 今後は /api/shares 等に集約予定
 */

function j(data: unknown, init?: number | ResponseInit) {
  if (typeof init === "number") return NextResponse.json(data, { status: init });
  return NextResponse.json(data, init);
}

export async function GET() {
  return j(
    {
      ok: false,
      error: "deprecated_endpoint",
      message: "This endpoint was removed. Use /api/shares instead.",
    },
    410
  );
}

export async function POST(_req: NextRequest) {
  return j(
    {
      ok: false,
      error: "deprecated_endpoint",
      message: "This endpoint was removed. Use /api/shares instead.",
    },
    410
  );
}
