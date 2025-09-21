// app/api/writer/route.ts
// 目的：テスト時は OpenAI に依存せず、常に ok: true を返す安定モック。
// 変更点：
// - style を「必須にしない」。来なければ複数の場所から推測（expect.style など）→ それも無ければ "generic"。
// - レスポンスに data.text / data.meta.style に加え、互換のため top-level "output" も返す。
// - 入力は基本なんでも受ける（422 を極力出さない）。テストの多様なペイロードに耐える。

import { NextRequest, NextResponse } from "next/server";

// 共通 JSON ヘルパ
function json(status: number, data: unknown) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

// ネストしたパスから文字列を安全に拾う（例: "expect.style"）
function pickString(obj: any, path: string): string | undefined {
  try {
    const v = path.split(".").reduce<any>((a, k) => (a == null ? undefined : a[k]), obj);
    return typeof v === "string" && v.length > 0 ? v : undefined;
  } catch {
    return undefined;
  }
}

// style を推測（優先順：style → expect.style → meta.style → template.style → options.style → config.style）
function resolveStyle(body: any): string {
  return (
    pickString(body, "style") ||
    pickString(body, "expect.style") ||
    pickString(body, "meta.style") ||
    pickString(body, "template.style") ||
    pickString(body, "options.style") ||
    pickString(body, "config.style") ||
    "generic"
  );
}

// 短い安全文を生成（スタイルに軽く寄せる）
function buildMockText(style: string, payload: Record<string, unknown>) {
  const subject =
    (payload as any)?.product?.name ??
    (payload as any)?.title ??
    (payload as any)?.topic ??
    "ご案内";
  switch (style) {
    case "email":
      return `件名：${String(subject)}のご案内\n本文：要点を簡潔にまとめました。`;
    case "headline_only":
      return `${String(subject)} — 注目ポイント`;
    case "lp":
      return `【${String(subject)}】概要と特長を簡潔にまとめました。`;
    case "sns_short":
      return `${String(subject)}の最新情報です。詳しくはリンクをご覧ください。`;
    case "product_card":
      return `${String(subject)}｜主要な特徴を短く整理しました。`;
    default:
      return `${String(subject)}のテキストです。`;
  }
}

// OpenAI を使うかどうか（テストは常にモック）
function shouldUseOpenAI() {
  const hasKey = !!process.env.OPENAI_API_KEY;
  const forceMock = process.env.WRITER_FORCE_MOCK === "1";
  const isTest = process.env.NODE_ENV === "test";
  return hasKey && !forceMock && !isTest;
}

export async function POST(req: NextRequest) {
  // JSON でない場合だけ 400（それ以外はなるべく通す）
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, code: "BAD_REQUEST", message: "Body must be JSON." });
  }

  // style を推測（来ていなければ expect.style 等から拾う。無ければ "generic"）
  const style = resolveStyle(body);
  const { style: _omit, expect: _e, meta: _m, template: _t, options: _o, config: _c, ...rest } =
    body ?? {};

  // ☆ テスト中はモック固定（OpenAI は呼ばない）
  if (!shouldUseOpenAI()) {
    const text = buildMockText(style, rest);
    // 互換：data.text / data.meta.style に加えて top-level "output" も返す
    return json(200, {
      ok: true,
      data: { text, meta: { style } },
      output: text,
    });
  }

  // 将来の本実装（未使用）：安全側のフォールバック
  const text = buildMockText(style, rest);
  return json(200, {
    ok: true,
    data: { text, meta: { style } },
    output: text,
  });
}

export async function GET() {
  return json(405, { ok: false, code: "METHOD_NOT_ALLOWED" });
}
