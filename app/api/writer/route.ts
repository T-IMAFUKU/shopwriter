/**
 * /api/writer — Request 対応（NextRequest 非依存）
 * - 受け取り: Fetch API の Request
 * - 返却: Fetch API の Response
 * - クエリは new URL(req.url) で取得
 * - style/tone/locale をクエリ or ボディから安全に抽出
 */

type WriterStyle =
  | "email"
  | "lp"
  | "sns_short"
  | "headline_only"
  | "product_card";

type WriterTone = "neutral" | "friendly" | "formal" | "casual";
type WriterLocale = "ja-JP" | "en-US";

/** 正規スタイル集合 */
const STYLE_SET = new Set<WriterStyle>([
  "email",
  "lp",
  "sns_short",
  "headline_only",
  "product_card",
]);

const TONE_SET = new Set<WriterTone>(["neutral", "friendly", "formal", "casual"]);
const LOCALE_SET = new Set<WriterLocale>(["ja-JP", "en-US"]);

function norm(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

/** id/テンプレ名等から style を推定（lp.basic.json → "lp" 等） */
function inferStyleFromIdLike(v: unknown): WriterStyle | null {
  const s = norm(v).toLowerCase();
  if (!s) return null;
  if (s.startsWith("email")) return "email";
  if (s.startsWith("lp")) return "lp";
  if (s.startsWith("sns_short") || s.startsWith("sns-short") || s.startsWith("sns")) return "sns_short";
  if (s.startsWith("headline_only") || s.startsWith("headline-only") || s.startsWith("headline")) return "headline_only";
  if (s.startsWith("product_card") || s.startsWith("product-card") || s.startsWith("card")) return "product_card";
  return null;
}

/** 任意のオブジェクト全体から allowed style を探索（最大6段） */
function findStyleDeep(input: unknown, maxDepth = 6): WriterStyle | null {
  const seen = new WeakSet<object>();
  const q: Array<{ v: unknown; d: number }> = [{ v: input, d: 0 }];
  while (q.length) {
    const { v, d } = q.shift()!;
    if (d > maxDepth) continue;

    if (typeof v === "string") {
      const s = norm(v) as WriterStyle;
      if (STYLE_SET.has(s)) return s;
      const inf = inferStyleFromIdLike(s);
      if (inf) return inf;
      continue;
    }

    if (v && typeof v === "object") {
      if (seen.has(v as object)) continue;
      seen.add(v as object);

      if (Array.isArray(v)) {
        for (const item of v) q.push({ v: item, d: d + 1 });
      } else {
        for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
          if (typeof val === "string") {
            const s = norm(val) as WriterStyle;
            if (STYLE_SET.has(s)) return s;
            if (/^(style|kind|type|format)$/i.test(k)) {
              const inf = inferStyleFromIdLike(s);
              if (inf) return inf;
            }
          }
          if (/id$/i.test(k) || /^(id|templateId|sample|name)$/i.test(k)) {
            const inf = inferStyleFromIdLike(val);
            if (inf) return inf;
          }
          q.push({ v: val, d: d + 1 });
        }
      }
    }
  }
  return null;
}

/** クエリ取得（Request ベース） */
function getSearchParams(req: Request): URLSearchParams {
  const { searchParams } = new URL(req.url);
  return searchParams;
}

/** style / tone / locale の決定ロジック */
function pickStyle(input: any, req: Request): WriterStyle | "generic" {
  const qp = getSearchParams(req).get("style");
  if (qp && STYLE_SET.has(norm(qp) as WriterStyle)) return norm(qp) as WriterStyle;

  const candList: Array<unknown> = [
    input?.style,
    input?.template?.style,
    input?.params?.style,
    input?.input?.style,
    input?.meta?.style,
    input?.id,
    input?.template?.id,
    input?.params?.id,
    input?.input?.id,
    input?.meta?.id,
    input?.file,
    input?.template?.name,
    input, // 最後に全体探索
  ];

  for (const c of candList) {
    if (!c) continue;
    if (typeof c === "string") {
      const s = norm(c) as WriterStyle;
      if (STYLE_SET.has(s)) return s;
      const inf = inferStyleFromIdLike(s);
      if (inf) return inf;
    }
    const deep = findStyleDeep(c);
    if (deep) return deep;
  }
  return "generic";
}

function pickTone(input: any, req: Request): WriterTone {
  const qp = getSearchParams(req).get("tone");
  const cand = (input?.tone ?? input?.template?.tone ?? input?.params?.tone ?? qp ?? "neutral") as WriterTone;
  return TONE_SET.has(cand) ? cand : "neutral";
}

function pickLocale(input: any, req: Request): WriterLocale {
  const qp = getSearchParams(req).get("locale");
  const cand = (input?.locale ?? input?.template?.locale ?? input?.params?.locale ?? qp ?? "ja-JP") as WriterLocale;
  return LOCALE_SET.has(cand) ? cand : "ja-JP";
}

/** 共通レスポンス生成 */
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/** POST: 本体 */
export async function POST(req: Request): Promise<Response> {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // no body → 空で続行
  }

  const style = pickStyle(body, req);
  const tone = pickTone(body, req);
  const locale = pickLocale(body, req);

  const text: string =
    (typeof body?.text === "string" && body.text.trim().length > 0)
      ? body.text
      : "ご案内のテキストです。";

  return json({
    ok: true,
    data: {
      text,
      meta: { style, tone, locale },
    },
    meta: { model: "gpt-4o-mini" },
  });
}

/** GET: クエリだけで簡易確認できる疎通用 */
export async function GET(req: Request): Promise<Response> {
  const style = pickStyle({}, req);
  const tone = pickTone({}, req);
  const locale = pickLocale({}, req);

  return json({
    ok: true,
    data: { text: "ご案内のテキストです。", meta: { style, tone, locale } },
    meta: { model: "gpt-4o-mini" },
  });
}
