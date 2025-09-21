export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const hdr = req.headers.get("x-dev-auth");
  const hasEnv =
    typeof process.env.SHARE_DEV_BYPASS_TOKEN === "string" &&
    process.env.SHARE_DEV_BYPASS_TOKEN.length > 0;

  return new Response(JSON.stringify({ ok: true, hdr, hasEnv }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, must-revalidate",
    },
  });
}
