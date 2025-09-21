/**
 * /api/shares
 * - 開発/テスト環境では X-User-Id ヘッダで認証相当を許可
 * - 本番では認証ミドルウェア経由（ここでは受け付けない）
 * - GET: 認証必須（dev/test はヘッダ可）, JSONで一覧（モック）
 * - POST: 最小ボディで 201 作成返却（dev/test はヘッダ可）
 */

type Json = Record<string, unknown>;

function json(data: Json, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function isDevOrTest() {
  const env = process.env.NODE_ENV || "development";
  return env === "development" || env === "test";
}

function isProd() {
  return process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
}

function getDevUserId(req: Request): string | null {
  const h = req.headers.get("X-User-Id") || req.headers.get("x-user-id");
  return h && h.trim().length > 0 ? h.trim() : null;
}

async function requireAuth(req: Request): Promise<{ userId: string } | Response> {
  // 本番はここでは受け付けない（middleware等で付与される想定）
  if (isProd()) {
    return json({ ok: false, error: "Unauthorized (prod requires real auth)" }, 401);
  }
  // dev/test は X-User-Id を許可
  const userId = getDevUserId(req);
  if (!userId) {
    return json({ ok: false, error: "Bad Request: missing X-User-Id" }, 400);
  }
  return { userId };
}

export async function GET(req: Request): Promise<Response> {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  // ここではモック（必要に応じてDB接続へ差替え）
  const list = [
    { id: "shr_mock_001", title: "モック共有1", ownerId: auth.userId },
    { id: "shr_mock_002", title: "モック共有2", ownerId: auth.userId },
  ];
  return json({ ok: true, data: list });
}

export async function POST(req: Request): Promise<Response> {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // 空でも可
  }

  // 最小必須: title（なければ 422）
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) {
    return json({ ok: false, error: "Unprocessable Entity: title is required" }, 422);
  }

  // ここではモック作成
  const created = {
    id: "shr_" + Math.random().toString(36).slice(2, 10),
    title,
    ownerId: auth.userId,
    createdAt: new Date().toISOString(),
  };

  return json({ ok: true, data: created }, 201);
}
