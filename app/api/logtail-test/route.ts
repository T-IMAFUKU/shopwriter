// app/api/logtail-test/route.ts  （新規／全文）
// 目的:
// - GET: 本番の環境変数が "読み取れるか" を安全に自己診断（トークン非公開）
// - POST: Better Stack 固有URL + Bearer で実送信し、202/204 を確認
// ランタイムを Node.js に固定（Edge経由だと送信が不安定になりやすいため）

import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ProbeInfo = {
  ok: boolean;
  status: number | null;
  endpointHost: string | null;
  message: string;
  probeId: string;
  hints?: {
    hasEndpoint: boolean;
    hasToken: boolean;
    tokenLen?: number;
  };
};

// 共通: ENV読み取り＆ホスト抽出
function readEnv() {
  const endpoint = process.env.LOGTAIL_ENDPOINT || "";
  const token = process.env.LOGTAIL_SOURCE_TOKEN || "";
  return { endpoint, token, host: safeHost(endpoint) };
}

function safeHost(url: string): string | null {
  try {
    const u = new URL(url);
    return u.host; // 例: sXXXX.eu-nbg-2.betterstackdata.com
  } catch {
    return null;
  }
}

// GET: 値の存在確認のみ（送信しない）
export async function GET() {
  const { endpoint, token, host } = readEnv();
  const body: ProbeInfo = {
    ok: Boolean(endpoint && token),
    status: null,
    endpointHost: host,
    message: !endpoint
      ? "Missing LOGTAIL_ENDPOINT"
      : !token
      ? "Missing LOGTAIL_SOURCE_TOKEN"
      : "Env variables present",
    probeId: "noop",
    hints: {
      hasEndpoint: Boolean(endpoint),
      hasToken: Boolean(token),
      tokenLen: token ? token.length : 0,
    },
  };
  // どちらか欠けていれば 500, そろっていれば 200
  return NextResponse.json(body, { status: body.ok ? 200 : 500 });
}

// POST: 実送信（202/204 を期待）
export async function POST() {
  const { endpoint, token, host } = readEnv();

  const probeId = `prod-probe-${Math.random().toString(16).slice(2, 10)}`;
  const ts = new Date().toISOString();

  if (!endpoint || !token) {
    const body: ProbeInfo = {
      ok: false,
      status: null,
      endpointHost: host,
      message: "Missing environment variables: LOGTAIL_ENDPOINT and/or LOGTAIL_SOURCE_TOKEN.",
      probeId,
      hints: {
        hasEndpoint: Boolean(endpoint),
        hasToken: Boolean(token),
        tokenLen: token ? token.length : 0,
      },
    };
    return NextResponse.json(body, { status: 500 });
  }

  const payload = {
    dt: ts,
    level: "INFO",
    message: `BetterStack probe (${probeId})`,
    service: "shopwriter",
    env: "production",
    probe: probeId,
  };

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`, // レスポンスに露出しない
      },
      body: JSON.stringify(payload),
    });

    const status = res.status;
    const ok = status === 202 || status === 204;
    const body: ProbeInfo = {
      ok,
      status,
      endpointHost: host,
      message: ok ? "Accepted by Better Stack" : `Unexpected status: ${status}`,
      probeId,
    };
    return NextResponse.json(body, { status: ok ? 200 : 502 });
  } catch (e: any) {
    const body: ProbeInfo = {
      ok: false,
      status: null,
      endpointHost: host,
      message: `Request failed: ${e?.message ?? "unknown error"}`,
      probeId,
    };
    return NextResponse.json(body, { status: 502 });
  }
}

// CORS/プリフライト最小対応（405回避の補助）
export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
    },
  });
}
