// app/api/logtail-test/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProbeInfo = {
  ok: boolean;
  status: number | null;
  endpointHost: string | null;
  message: string;
  probeId: string;
  hints?: {
    hasEndpoint: boolean;
    hasToken: boolean;
  };
};

function isPublicDeployment(): boolean {
  return process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
}

function notFound(): Response {
  return new Response(null, { status: 404 });
}

function readEnv() {
  const endpoint = process.env.LOGTAIL_ENDPOINT || "";
  const token = process.env.LOGTAIL_SOURCE_TOKEN || "";

  return {
    endpoint,
    token,
    host: safeHost(endpoint),
  };
}

function safeHost(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.host;
  } catch {
    return null;
  }
}

/**
 * GET /api/logtail-test
 *
 * 開発環境専用のBetter Stack / Logtail診断API。
 * 公開環境では存在自体を隠すため 404 を返す。
 */
export async function GET() {
  if (isPublicDeployment()) {
    return notFound();
  }

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
    },
  };

  return NextResponse.json(body, {
    status: body.ok ? 200 : 500,
    headers: {
      "Cache-Control": "no-store, must-revalidate",
    },
  });
}

/**
 * POST /api/logtail-test
 *
 * 開発環境専用の送信確認API。
 * 公開環境では外部からログ送信を発火できないよう 404 を返す。
 */
export async function POST() {
  if (isPublicDeployment()) {
    return notFound();
  }

  const { endpoint, token, host } = readEnv();

  const probeId = `dev-probe-${Math.random().toString(16).slice(2, 10)}`;
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
      },
    };

    return NextResponse.json(body, {
      status: 500,
      headers: {
        "Cache-Control": "no-store, must-revalidate",
      },
    });
  }

  const payload = {
    dt: ts,
    level: "INFO",
    message: `Better Stack development probe (${probeId})`,
    service: "shopwriter",
    env: "development",
    probe: probeId,
  };

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
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

    return NextResponse.json(body, {
      status: ok ? 200 : 502,
      headers: {
        "Cache-Control": "no-store, must-revalidate",
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };

    const body: ProbeInfo = {
      ok: false,
      status: null,
      endpointHost: host,
      message: `Request failed: ${err.message ?? "unknown error"}`,
      probeId,
    };

    return NextResponse.json(body, {
      status: 502,
      headers: {
        "Cache-Control": "no-store, must-revalidate",
      },
    });
  }
}

export function OPTIONS() {
  if (isPublicDeployment()) {
    return notFound();
  }

  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Cache-Control": "no-store, must-revalidate",
    },
  });
}