// app/api/dev-auth/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isPublicDeployment(): boolean {
  return process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
}

function notFound(): Response {
  return new Response(null, { status: 404 });
}

/**
 * GET /api/dev-auth
 *
 * 開発環境専用の診断API。
 * 公開環境では存在自体を隠すため 404 を返す。
 *
 * 注意:
 * - token本体は開発環境でも返さない
 * - 受信ヘッダー値も返さない
 * - boolean の診断結果のみ返す
 */
export async function GET(req: Request) {
  if (isPublicDeployment()) {
    return notFound();
  }

  const header = req.headers.get("x-dev-auth");
  const token = process.env.SHARE_DEV_BYPASS_TOKEN ?? "";

  const hasHeader = typeof header === "string" && header.length > 0;
  const hasToken = token.length > 0;
  const matched = hasHeader && hasToken && header === token;

  return NextResponse.json(
    {
      ok: true,
      path: "/api/dev-auth",
      hasHeader,
      hasToken,
      matched,
      ts: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, must-revalidate",
      },
    },
  );
}