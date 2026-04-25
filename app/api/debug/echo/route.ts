// app/api/debug/echo/route.ts
export const dynamic = "force-dynamic";

function isPublicDeployment(): boolean {
  return process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
}

function notFound(): Response {
  return new Response(null, { status: 404 });
}

/**
 * GET /api/debug/echo
 *
 * 開発環境専用のヘッダー到達確認API。
 * 公開環境では存在自体を隠すため 404 を返す。
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

  return new Response(
    JSON.stringify({
      ok: true,
      path: "/api/debug/echo",
      hasHeader,
      hasToken,
      matched,
      ts: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store, must-revalidate",
      },
    },
  );
}