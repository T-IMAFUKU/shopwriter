// app/api/writer/health/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HealthOk = {
  ok: true;
  service: "writer";
  ts: string;
};

type HealthErr = {
  ok: false;
  service: "writer";
  error: string;
  ts: string;
};

/**
 * GET /api/writer/health
 *
 * 公開可能な最小health API。
 * 内部env、APIキー状態、model名、temperature、debug設定は返さない。
 */
export async function GET() {
  try {
    const payload: HealthOk = {
      ok: true,
      service: "writer",
      ts: new Date().toISOString(),
    };

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, must-revalidate",
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };

    const payload: HealthErr = {
      ok: false,
      service: "writer",
      error: err.message ?? "unexpected error",
      ts: new Date().toISOString(),
    };

    return NextResponse.json(payload, {
      status: 500,
      headers: {
        "Cache-Control": "no-store, must-revalidate",
      },
    });
  }
}