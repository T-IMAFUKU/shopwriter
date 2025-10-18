// app/api/writer/health/route.ts
// Runtime: Node.js（環境変数チェックのため）
export const runtime = "nodejs";

import { NextResponse } from "next/server";

type HealthOk = {
  ok: true;
  data: {
    env: {
      OPENAI_API_KEY: "set" | "missing";
      WRITER_FEWSHOT: "1|true" | "0|false|unset";
      DEBUG_TEMPLATE_API: string; // "stub"ならスタブ応答
      NODE_ENV: string;
    };
    writer: {
      provider: "openai";
      defaultModel: string;
      defaultTemperature: number;
      fewshotEnabled: boolean;
      stubMode: boolean;
    };
    meta: {
      ts: string;
      region?: string;
    };
  };
};

type HealthErr = {
  ok: false;
  error: string;
  details?: string;
};

export async function GET() {
  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const WRITER_FEWSHOT = String(process.env.WRITER_FEWSHOT ?? "").toLowerCase();
    const DEBUG_TEMPLATE_API = String(process.env.DEBUG_TEMPLATE_API ?? "");
    const NODE_ENV = String(process.env.NODE_ENV ?? "");

    const fewshotEnabled = /^(1|true)$/.test(WRITER_FEWSHOT);
    const stubMode = DEBUG_TEMPLATE_API.toLowerCase() === "stub";

    const payload: HealthOk = {
      ok: true,
      data: {
        env: {
          OPENAI_API_KEY: OPENAI_API_KEY ? "set" : "missing",
          WRITER_FEWSHOT: fewshotEnabled ? "1|true" : "0|false|unset",
          DEBUG_TEMPLATE_API,
          NODE_ENV,
        },
        writer: {
          provider: "openai",
          defaultModel: "gpt-4o-mini",
          defaultTemperature: 0.7,
          fewshotEnabled,
          stubMode,
        },
        meta: {
          ts: new Date().toISOString(),
          // Vercelのリージョン（Edgeでは無いので undefined になることも）
          region: (process as any)?.env?.VERCEL_REGION,
        },
      },
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (e: any) {
    const err: HealthErr = {
      ok: false,
      error: e?.message ?? "unexpected error",
    };
    return NextResponse.json(err, { status: 500 });
  }
}
