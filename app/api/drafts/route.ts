import { NextRequest, NextResponse } from "next/server";

/**
 * Deprecated endpoint: /api/drafts
 * This route is intentionally kept for backward compatibility and always returns 410 Gone.
 * Use /api/shares instead.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, init?: number | ResponseInit) {
  return typeof init === "number"
    ? NextResponse.json(data, { status: init })
    : NextResponse.json(data, init);
}

const GONE_PAYLOAD = {
  ok: false as const,
  error: "deprecated_endpoint" as const,
  message: "This endpoint was removed. Use /api/shares instead.",
};

export async function GET() {
  return json(GONE_PAYLOAD, 410);
}

export async function POST(_req: NextRequest) {
  return json(GONE_PAYLOAD, 410);
}
