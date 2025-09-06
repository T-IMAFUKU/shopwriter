import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 受信ペイロードのバリデーション（UI側の現行フィールドを広めに許容）
const WriterSchema = z.object({
  productName: z.string().min(1, "productName is required"),
  audience: z.string().min(1, "audience is required"),
  // 任意項目（存在すれば活用）
  template: z.string().optional(),      // 例: "EC" / "SaaS" / "不動産"
  tone: z.string().optional(),          // 例: "カジュアル" / "フォーマル"
  keywords: z.array(z.string()).optional(),
  language: z.string().optional(),      // 例: "ja" / "en"
  maxWords: z.number().int().positive().optional(), // 文字数/語数の上限目安
  notes: z.string().optional(),         // 補足・制約
});

type WriterPayload = z.infer<typeof WriterSchema>;

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_TEMPERATURE = 0.7;

// プロンプト組み立て（System + User）
function buildMessages(input: WriterPayload) {
  const lang = input.language ?? "ja";
  const kw = input.keywords?.length ? `\n- キーワード: ${input.keywords.join(", ")}` : "";
  const tone = input.tone ? `\n- トーン: ${input.tone}` : "";
  const template = input.template ? `\n- テンプレ: ${input.template}` : "";
  const max = input.maxWords ? `\n- 目安長さ: 約${input.maxWords}語/字` : "";
  const notes = input.notes ? `\n- 追加条件: ${input.notes}` : "";

  const userPrompt = [
    `あなたは商品説明文のプロコピーライター（言語: ${lang}）。以下の条件で魅力的な商品説明を1つ作成してください。`,
    `- 商品名: ${input.productName}`,
    `- 想定読者: ${input.audience}`,
    kw,
    tone,
    template,
    max,
    notes,
    `\n# 出力要件`,
    `- プレーンテキスト（Markdown可）`,
    `- 見出し + 本文 + 箇条書きを適度に用いる`,
    `- 誇大表現を避け、具体的メリット・使用シーン・CTAを含める`,
  ]
    .filter(Boolean)
    .join("\n");

  const system = `You are "ShopWriter", a concise, commercially safe copywriter. Avoid unsupported claims. Keep it directly usable in UI.`;

  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: userPrompt },
  ];
}

// モック生成（OPENAI_API_KEYが無いとき用）
function mockGenerate(input: WriterPayload) {
  const bullets =
    input.keywords && input.keywords.length
      ? input.keywords.slice(0, 5).map((k) => `- ${k}`).join("\n")
      : "- 使いやすい\n- コスパ良い\n- 初心者OK";

  const tone = input.tone ?? "標準";
  const tmpl = input.template ?? "EC";
  const length = input.maxWords ? `（目安: 約${input.maxWords}）` : "";

  const text = [
    `# ${input.productName}｜${input.audience}向け`,
    ``,
    `「${input.productName}」は、${input.audience}のために設計された実用的なソリューションです。${length}`,
    ``,
    `## 特長（トーン: ${tone} / テンプレ: ${tmpl}）`,
    bullets,
    ``,
    `## こんなシーンで活躍`,
    `- 日常の作業効率を上げたいとき`,
    `- 初期導入の手間を抑えたいとき`,
    `- コストを最小化しつつ効果を出したいとき`,
    ``,
    `## CTA`,
    `今すぐ「${input.productName}」をお試しください。まずは無料で体験できます。`,
  ].join("\n");

  return {
    ok: true,
    mock: true,
    model: "mock-local",
    text,
  };
}

export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => ({}));
    const parsed = WriterSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "VALIDATION_ERROR",
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const input = parsed.data;

    // 環境変数が無ければモック
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      const mock = mockGenerate(input);
      return NextResponse.json(mock, { status: 200 });
    }

    // OpenAI（本番モード）
    const openai = new OpenAI({ apiKey });
    const messages = buildMessages(input);

    const completion = await openai.chat.completions.create({
      model: DEFAULT_MODEL,
      temperature: DEFAULT_TEMPERATURE,
      messages,
    });

    const text =
      completion.choices?.[0]?.message?.content?.trim() ??
      "(no content)";

    return NextResponse.json(
      {
        ok: true,
        mock: false,
        model: DEFAULT_MODEL,
        text,
        usage: completion.usage ?? null,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown error";
    // 統一エラーフォーマット
    return NextResponse.json(
      {
        ok: false,
        error: "INTERNAL_ERROR",
        message,
      },
      { status: 500 }
    );
  }
}
