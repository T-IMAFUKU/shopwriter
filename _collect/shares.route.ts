// app/api/shares/route.ts
// シンプル＆テスト準拠の実装：GET/POST を正規化。
// - GET: ヘッダー認証を見て 200 or 401。クエリが不正なら 400(BAD_REQUEST)。必ず nextCursor を含める。
// - POST: ボディを受け取り、title だけでも受理（slug をサーバ側で生成）。成功 201 / 失敗 422。

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { shareCreateSchema, shareListQuerySchema } from "@/contracts/share";

// =========================
// ヘルパ
// =========================
const isProd = () => process.env.NODE_ENV === "production";

function json(status: number, data: unknown) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function unauthorized(message: string) {
  return json(401, { ok: false, code: "UNAUTHORIZED", message });
}

function badRequest(message: string) {
  return json(400, { ok: false, code: "BAD_REQUEST", message });
}

function unprocessable(message: string, issues?: unknown) {
  return json(422, { ok: false, code: "UNPROCESSABLE_ENTITY", message, issues });
}

// slug 生成（契約の想定パターン：^[a-z0-9]+(?:-[a-z0-9]+)*$, 長さ3..50）
function slugify(input: string): string {
  const s = input
    .toLowerCase()
    .replace(/[_\s]+/g, "-")          // 空白/アンダーバー→ハイフン
    .replace(/[^a-z0-9-]/g, "")       // 英数とハイフン以外除去
    .replace(/-+/g, "-")              // ハイフン連続→1つ
    .replace(/^-+|-+$/g, "");         // 先頭末尾ハイフン除去
  let out = s.slice(0, 50);
  if (out.length < 3) out = (out + "-xxx").slice(0, 3); // 最低長を満たす
  return out;
}

// 簡易ストア（動作確認用）
type ShareEntity = { id: string; title: string; slug: string; isPublic: boolean };
const store: ShareEntity[] = [];

// 共通：開発/本番の認証ルール
function ensureAuth(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  // 本番は厳格、開発もテストではヘッダー必須の想定で揃える
  if (!userId) {
    return unauthorized(isProd() ? "Authentication required." : "X-User-Id required.");
  }
  return null;
}

// =========================
// GET /api/shares
// =========================
export async function GET(req: NextRequest) {
  const unauth = ensureAuth(req);
  if (unauth) return unauth;

  // クエリ検証（現状は {} のみ OK の契約。余分キーは 400 に丸める）
  const url = new URL(req.url);
  const queryObj: Record<string, unknown> = {};
  // 何も無ければ空オブジェクトのまま
  url.searchParams.forEach((v, k) => (queryObj[k] = v));

  const q = shareListQuerySchema.safeParse(queryObj);
  if (!q.success) {
    // Zod のまま出さず BAD_REQUEST に正規化
    return badRequest("Invalid query parameters.");
  }

  // items と nextCursor を常に返す（テスト期待）
  const items = store.map((s) => ({
    id: s.id,
    title: s.title,
    isPublic: s.isPublic,
    slug: s.slug,
  }));

  return json(200, { ok: true, items, nextCursor: null });
}

// =========================
// POST /api/shares
// =========================
export async function POST(req: NextRequest) {
  const unauth = ensureAuth(req);
  if (unauth) return unauth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Body must be JSON.");
  }

  // テストでは title のみで送るケースがあるため、slug が無ければサーバ側で生成してから契約に通す
  const relaxed = z
    .object({
      title: z.string().min(1, "title is required"),
      slug: z.string().min(0).optional(),
      isPublic: z.boolean().optional(),
    })
    .strict();

  const r = relaxed.safeParse(body);
  if (!r.success) {
    return unprocessable("Invalid body.", r.error.issues);
  }

  const filled = {
    title: r.data.title,
    slug: r.data.slug && r.data.slug.length > 0 ? r.data.slug : slugify(r.data.title),
    isPublic: r.data.isPublic ?? false,
  };

  // 最終的には“厳格な契約”で検証
  const finalParse = shareCreateSchema.safeParse(filled);
  if (!finalParse.success) {
    return unprocessable("Invalid body.", finalParse.error.issues);
  }

  const created: ShareEntity = {
    id: crypto.randomUUID(),
    title: finalParse.data.title,
    slug: finalParse.data.slug,
    isPublic: finalParse.data.isPublic ?? false,
  };
  store.push(created);

  // 成功時は 201 でエンティティ（id 含む）を返す
  return json(201, created);
}
