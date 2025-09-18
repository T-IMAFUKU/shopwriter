// app/api/metrics/ingest/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PayloadSchema = z
  .object({
    event: z.string().min(1, "event is required"),
    props: z.record(z.any()).optional(),
    ts: z.number().int().positive().optional(), // epoch（秒/ミリ秒）想定：後続Stepで正規化
  })
  .strict();

function j(data: unknown, init?: number | ResponseInit) {
  if (typeof init === "number") return NextResponse.json(data, { status: init });
  return NextResponse.json(data, init);
}

// GETは405（POSTのみ許可）
export async function GET() {
  return j(
    { ok: false, error: "method_not_allowed", allow: ["POST"] },
    { status: 405, headers: { Allow: "POST" } }
  );
}

// 最小実装：トークン認証 + Zodバリデーション + エコー（保存は次Step）
export async function POST(req: NextRequest) {
  const expected = process.env.METRICS_INGEST_TOKEN ?? "";
  const provided = req.headers.get("x-metrics-token") ?? "";

  if (!expected || !provided || provided !== expected) {
    return j({ ok: false, error: "unauthorized" }, 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return j({ ok: false, error: "invalid_json" }, 400);
  }

  const parsed = PayloadSchema.safeParse(body);
  if (!parsed.success) {
    return j(
      { ok: false, error: "validation_error", issues: parsed.error.flatten() },
      400
    );
  }

  return j(
    {
      ok: true,
      received: parsed.data,
      serverTime: new Date().toISOString(),
      env: process.env.VERCEL ? "vercel" : "local",
    },
    200
  );
}
