import { NextRequest, NextResponse } from "next/server";

type WriterStyle =
  | "email"
  | "lp"
  | "sns_short"
  | "headline_only"
  | "product_card";

type WriterTone = "neutral" | "friendly" | "formal" | "casual";
type WriterLocale = "ja-JP" | "en-US";

const STYLE_SET = new Set<WriterStyle>([
  "email",
  "lp",
  "sns_short",
  "headline_only",
  "product_card",
]);

function norm(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

/** id などから style を推定（lp.basic.json → "lp" 等） */
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

/** 任意のオブジェクト全体から allowed style を深さ優先で探索（最大6段） */
function findStyleDeep(input: unknown, maxDepth = 6): WriterStyle | null {
  const seen = new WeakSet<object>();
  const q: Array<{ v: unknown; d: number }> = [{ v: input, d: 0 }];
  while (q.length) {
    const { v, d } = q.shift()!;
    if (d > maxDepth) continue;

    if (typeof v === "string") {
      const s = norm(v) as WriterStyle;
      if (STYLE_SET.has(s)) return s;
      // 文字列なら id 由来の推定も試す
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
          // ヒントになりやすいキーを先に確認
          if (typeof val === "string") {
            const s = norm(val) as WriterStyle;
            if (STYLE_SET.has(s)) return s;
            if (/^(style|kind|type|format)$/i.test(k)) {
              const inf = inferStyleFromIdLike(s);
              if (inf) return inf;
            }
          }
          // id 系からの推定
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

function pickStyle(input: any, req: NextRequest): WriterStyle | "generic" {
  // 1) クエリ優先（?style=lp など）
  const qp = req.nextUrl.searchParams.get("style");
  if (qp && STYLE_SET.has(norm(qp) as WriterStyle)) return norm(qp) as WriterStyle;

  // 2) よくある場所を順に確認
  const candList: Array<unknown> = [
    input?.style,
    input?.template?.style,
    input?.params?.style,
    input?.input?.style,
    input?.meta?.style,
    // id/テンプレID/ファイル名などからの推定
    input?.id,
    input?.template?.id,
    input?.params?.id,
    input?.input?.id,
    input?.meta?.id,
    input?.file,
    input?.template?.name,
    // 3) 最後に全体探索
    input,
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

function pickTone(input: any, req: NextRequest): WriterTone {
  const qp = req.nextUrl.searchParams.get("tone");
  const cand = (input?.tone ?? input?.template?.tone ?? input?.params?.tone ?? qp ?? "neutral") as WriterTone;
  const allowed = new Set<WriterTone>(["neutral", "friendly", "formal", "casual"]);
  return allowed.has(cand) ? cand : "neutral";
}

function pickLocale(input: any, req: NextRequest): WriterLocale {
  const qp = req.nextUrl.searchParams.get("locale");
  const cand = (input?.locale ?? input?.template?.locale ?? input?.params?.locale ?? qp ?? "ja-JP") as WriterLocale;
  const allowed = new Set<WriterLocale>(["ja-JP", "en-US"]);
  return allowed.has(cand) ? cand : "ja-JP";
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // no body → 空で続行
  }

  const style = pickStyle(body, req);
  const tone = pickTone(body, req);
  const locale = pickLocale(body, req);

  // ここではモック/簡易生成（テスト安定化）
  const text: string =
    (typeof body?.text === "string" && body.text.trim().length > 0)
      ? body.text
      : "ご案内のテキストです。";

  const json = {
    ok: true,
    data: {
      text,
      meta: { style, tone, locale },
    },
    meta: { model: "gpt-4o-mini" },
  };

  return NextResponse.json(json, { status: 200 });
}

// 任意：GET でも疎通確認
export async function GET(req: NextRequest) {
  const style = pickStyle({}, req);
  const tone = pickTone({}, req);
  const locale = pickLocale({}, req);
  return NextResponse.json(
    {
      ok: true,
      data: { text: "ご案内のテキストです.", meta: { style, tone, locale } },
      meta: { model: "gpt-4o-mini" },
    },
    { status: 200 }
  );
}
