// app/api/writer/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";

export const runtime = "edge";

// ===== Zod: 入力バリデーション =====
const BodySchema = z.object({
  prompt: z.string().min(8, "prompt は8文字以上で入力してください"),
  tone: z.enum(["neutral", "friendly", "formal"]).optional().default("neutral"),
  length: z.enum(["short", "medium", "long"]).optional().default("medium"),
  // 追加項目が必要ならここに拡張
});

// ===== 共通: CORSヘッダ（プリフライト定着化） =====
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// 任意の軽量ヘルスチェック（必要に応じて利用）
export async function GET() {
  return NextResponse.json(
    { ok: true, endpoint: "/api/writer", ts: Date.now() },
    { headers: CORS_HEADERS }
  );
}

// ===== 本来の生成ロジック（非ストリーミング） =====
export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.flatten() },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const { prompt, tone, length } = parsed.data;

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { ok: false, error: "OPENAI_API_KEY が未設定です" },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    // 出力方針（日本語EC向けの下書きテンプレ）
    const system = [
      "あなたは日本語ECのコピーライターです。",
      "商品説明を見出し(H1)、要点(箇条書き)、本文、CTAの順に簡潔に構成します。",
      "冗長表現は避け、具体性・可読性を優先します。",
      `トーン: ${tone}、想定分量: ${length}`,
    ].join("\n");

    const user = [
      "次の入力から商品説明の下書きを作成してください。",
      "出力は Markdown。H1/要点/本文/CTA の4ブロックを必ず含めてください。",
      `入力: ${prompt}`,
    ].join("\n");

    // モデルは軽量を既定（必要に応じて変更）
    const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

    const resp = await openai.chat.completions.create({
      model,
      temperature: 0.7,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const content =
      resp.choices?.[0]?.message?.content?.trim() ??
      "# 出力に失敗しました\n\n再度お試しください。";

    // メタ情報（検証で利用）
    const meta = {
      model,
      usage: resp.usage,
      id: resp.id,
      created: resp.created,
    };

    return NextResponse.json(
      { ok: true, output: content, meta },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: err?.message ?? "サーバーエラー",
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
