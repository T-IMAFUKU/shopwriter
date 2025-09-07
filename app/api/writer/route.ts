// 使用システム: Next.js(App Router) / TypeScript / OpenAI Node SDK v4
import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs"; // Edgeでも可だが、まずはnodejsで安定運用

// 受信ボディの型
type WriterRequest = {
  productName: string;
  audience: string;
  template: string;
  tone: string;
  keywords: string[];
  language: string; // "ja" | "en" など
};

// プロンプト生成（必要に応じて調整可）
function buildPrompt(input: WriterRequest): string {
  const kw = (input.keywords || []).join(" / ");
  const lang = input.language?.toLowerCase() || "ja";

  // 出力言語を切替（日本語を既定）
  const langLine =
    lang === "ja"
      ? "出力は必ず日本語で、マークダウン（#見出し, 箇条書き）で記述してください。"
      : `出力は必ず${lang}で、Markdownで記述してください。`;

  return [
    `あなたはECサイト向けの日本語コピーライター「ShopWriter」です。`,
    `以下の入力を踏まえ、EC商品紹介のテンプレートに沿って、訴求力の高い本文を作成してください。`,
    `- 製品名: ${input.productName}`,
    `- 想定読者: ${input.audience}`,
    `- テンプレート: ${input.template}`,
    `- トーン: ${input.tone}`,
    `- キーワード: ${kw || "（指定なし）"}`,
    langLine,
    `要件:`,
    `1) まず「# 見出し」を1行。製品名＋ベネフィットを端的に。`,
    `2) 続けて「## 要点」を3–6項目の箇条書きで。`,
    `3) 最後に「## 本文」で200–400字目安の説明文。`,
    `4) 事実の断定は避け、一般的表現で安全に書く。`,
  ].join("\n");
}

export async function GET() {
  // ヘルスチェック（GETで開くとこれが返る）
  const data = { ok: true, route: "/api/writer" };
  return new NextResponse(JSON.stringify(data), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as WriterRequest;

    // 入力バリデーション（最小限）
    if (!body?.productName || !body?.audience) {
      return NextResponse.json(
        { ok: false, error: "invalid_request", message: "productName と audience は必須です。" },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "server_config", message: "OPENAI_API_KEY が未設定です。" },
        { status: 500 }
      );
    }

    const client = new OpenAI({ apiKey });

    // モデルは軽量・低コストな "gpt-4o-mini" を既定に
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const prompt = buildPrompt(body);

    const completion = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are ShopWriter, a meticulous e-commerce copywriter. Be concise, clear, and follow the requested structure strictly.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 700, // 必要に応じて調整
    });

    const text =
      completion.choices?.[0]?.message?.content?.toString() ??
      "（生成結果を取得できませんでした）";

    const data = {
      ok: true,
      mock: false,
      model,
      text,
      received: body,
    };

    return new NextResponse(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    // OpenAIエラーやJSONパースエラーなどを包括
    const message =
      err?.response?.data?.error?.message ||
      err?.message ||
      "unknown_error";
    return NextResponse.json(
      { ok: false, error: "server_error", message },
      { status: 500 }
    );
  }
}
