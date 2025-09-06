// FILE: app/api/writer/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs"; // Edge不可APIを使う可能性があるため nodejs を明示

// 入力スキーマ（UIと合わせる）
const WriterInputSchema = z.object({
  productName: z.string().min(1, "商品名は必須です"),
  audience: z.string().min(1, "想定読者は必須です"),
  template: z.string().min(1, "テンプレートは必須です"),
  tone: z.string().min(1, "トーンは必須です"),
  keywords: z.array(z.string()).default([]),
  language: z.string().min(2).max(5).default("ja"),
  // 任意で model 指定可能（未指定なら既定）
  model: z.string().optional(),
});

type WriterInput = z.infer<typeof WriterInputSchema>;

const MOCK_TEXT = `【モック出力】
以下の条件に基づくサンプル本文です。実API接続の前段テスト用。

- 商品名: {productName}
- 想定読者: {audience}
- テンプレート: {template}
- トーン: {tone}
- キーワード: {keywords}
- 言語: {language}

（このメッセージが「出力」タブに表示されればOK）`;

// OpenAI 呼び出し（SDK無依存で fetch を使用）
async function generateWithOpenAI(input: WriterInput) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // フォールバック（モック）
    const text = MOCK_TEXT
      .replace("{productName}", input.productName)
      .replace("{audience}", input.audience)
      .replace("{template}", input.template)
      .replace("{tone}", input.tone)
      .replace("{keywords}", input.keywords.join(", "))
      .replace("{language}", input.language);
    return { mock: true, model: "mock-v1", text };
  }

  const model = input.model ?? "gpt-4o-mini";
  const system =
    input.language === "ja"
      ? "あなたは日本語のECライティングに精通したプロのコピーライターです。出力は必ず日本語で、箇条書き→本文の順に簡潔に。"
      : "You are a professional copywriter for e-commerce. Be concise and helpful.";

  const userPrompt =
    input.language === "ja"
      ? [
          `# 条件`,
          `- 商品名: ${input.productName}`,
          `- 想定読者: ${input.audience}`,
          `- テンプレート: ${input.template}`,
          `- トーン: ${input.tone}`,
          `- キーワード: ${input.keywords.join(", ") || "（なし）"}`,
          ``,
          `# 指示`,
          `1) 見出し（H2相当）`,
          `2) 箇条書きで要点（3〜5点）`,
          `3) 150〜250字の本文（トーンに合わせる）`,
        ].join("\n")
      : [
          `# Conditions`,
          `- Product: ${input.productName}`,
          `- Audience: ${input.audience}`,
          `- Template: ${input.template}`,
          `- Tone: ${input.tone}`,
          `- Keywords: ${input.keywords.join(", ") || "(none)"}`,
          ``,
          `# Task`,
          `1) A heading`,
          `2) 3-5 bullet points`,
          `3) A 100-160 word paragraph in the given tone.`,
        ].join("\n");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    throw new Error(
      `OpenAI API error: HTTP ${res.status} ${res.statusText} ${errJson?.error?.message ?? ""}`.trim(),
    );
  }

  const data = (await res.json()) as any;
  const text =
    data?.choices?.[0]?.message?.content ??
    "(no content from OpenAI)";

  return { mock: false, model, text };
}

export async function POST(req: Request) {
  try {
    const json = (await req.json()) as unknown;
    const input = WriterInputSchema.parse(json) as WriterInput;

    const { mock, model, text } = await generateWithOpenAI(input);

    return NextResponse.json(
      {
        ok: true,
        mock,
        model,
        received: input,
        text,
      },
      { status: 200 },
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, mock: true, error: "VALIDATION_ERROR", details: err.flatten() },
        { status: 400 },
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, mock: true, error: "OPENAI_OR_UNKNOWN", message: msg },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      mock: !process.env.OPENAI_API_KEY,
      endpoint: "/api/writer",
      model: process.env.OPENAI_API_KEY ? "gpt-4o-mini (default)" : "mock-v1",
    },
    { status: 200 },
  );
}
