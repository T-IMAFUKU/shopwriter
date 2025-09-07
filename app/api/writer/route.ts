// app/api/writer/route.ts
/* eslint-disable */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";
import crypto from "crypto";

/** ===== 入力スキーマ ===== */
const InputSchema = z.object({
  productName: z.string().min(1, "productName is required"),
  audience: z.string().default("EC担当者"),
  template: z.enum(["EC", "不動産", "SaaS"]).default("EC"),
  tone: z.string().default("カジュアル"),
  keywords: z.array(z.string()).default([]),
  language: z.enum(["ja", "en"]).default("ja"),
});
type Input = z.infer<typeof InputSchema>;

/** ===== 産業別ブリーフ ===== */
const INDUSTRY_BRIEFS: Record<Input["template"], string> = {
  EC: [
    "- 文脈: 自社EC・モール(楽天/Amazon)商品ページ用。SEOとCVに配慮。",
    "- 読者: EC担当者/購買検討者。比較検討の最中。",
    "- 成果: 検索回遊→クリック→滞在→カート投入までを後押し。",
  ].join("\n"),
  "不動産": [
    "- 文脈: 賃貸/売買の物件紹介文。立地・設備・生活利便性を端的に訴求。",
    "- 読者: 内見直前の見込み顧客。",
    "- 成果: 問い合わせ/内見予約のCTAを明確に。",
  ].join("\n"),
  SaaS: [
    "- 文脈: B2B SaaSのLP/詳細。導入効果・ROI・運用負荷を明確化。",
    "- 読者: 現場責任者/意思決定者。課題→解決→効果の筋道が重要。",
    "- 成果: 無料トライアル/デモ予約/資料DLのCTAへ接続。",
  ].join("\n"),
};

/** ===== 見出し仕様（固定） =====
 * - # タイトル
 * - ## 要点（箇条書き 4–6項目・各40–80字）
 * - ## 本文（300–500字：結論→特徴→効果）
 * - ## CTA（1–2行）
 */
const OUTPUT_SPEC = [
  "出力は必ずMarkdown。見出しの文言は**完全固定**：",
  "1) `# タイトル`",
  "2) `## 要点`（箇条書き 4–6項目・各40–80字）",
  "3) `## 本文`（300–500字：結論→特徴→効果）",
  "4) `## CTA`（1–2行）",
  "禁止: 「概要/ポイント/特長/まとめ/Call to Action/行動喚起/次のステップ」等の別表記。",
  "必ず「要点」「本文」「CTA」をそのまま使うこと。",
].join("\n");

/** ===== トーン指示 ===== */
function toneGuide(tone: string) {
  switch (tone) {
    case "フォーマル":
      return "トーン: 端的・信頼重視・ビジネス丁寧語。誇張は避け事実ベース。";
    case "カジュアル":
      return "トーン: 親しみやすく、平易に。専門用語は噛み砕く。";
    case "エビデンス重視":
      return "トーン: 数字・事例・比較を明示。主観を控えロジカルに。";
    default:
      return `トーン: ${tone}（過度な誇張は避ける）。`;
  }
}

/** ===== システム/ユーザープロンプト ===== */
function buildSystemPrompt(lang: Input["language"]) {
  const role =
    lang === "ja"
      ? "あなたは日本語に特化した上級コピーライター兼編集者です。"
      : "You are a senior copywriter/editor specialized in high-conversion marketing copy.";
  const style =
    lang === "ja"
      ? "不自然な直訳を避け、自然で情報密度の高い日本語で書く。"
      : "Avoid literal translations; keep prose natural, concise, and information-dense.";
  const guard =
    "出力仕様と見出し固定ルールに厳密に従うこと。違反時は正しい見出しで再構成。";
  return [role, style, guard].join("\n");
}

function buildUserPrompt(input: Input) {
  const { productName, audience, template, tone, keywords, language } = input;
  const kw = keywords?.length ? `キーワード候補: ${keywords.join(", ")}` : "キーワード候補: （任意）";
  const industry = `【業界前提:${template}】\n${INDUSTRY_BRIEFS[template]}`;
  const meta =
    language === "ja"
      ? [
          `【対象読者】${audience}`,
          `【トーン】${tone}`,
          toneGuide(tone),
          kw,
          "【スタイル要件】重複語を避け、独自の切り口を1つ以上入れる。数値や具体を優先。",
        ].join("\n")
      : [
          `Audience: ${audience}`,
          `Tone: ${tone}`,
          toneGuide(tone),
          kw,
          "Style: avoid repetition; include at least one unique angle; prefer concrete details.",
        ].join("\n");
  const task =
    language === "ja"
      ? [`【執筆対象】${productName}`, "以下の出力仕様を厳守：", OUTPUT_SPEC].join("\n")
      : [`Target: ${productName}`, "Follow the output spec strictly:", OUTPUT_SPEC].join("\n");
  return [industry, meta, task].join("\n\n");
}

/** ===== 出力サニタイザ：同義語→正式見出し ===== */
function enforceHeadings(md: string) {
  let out = md.replace(/\r\n/g, "\n");
  const pairs: Array<[RegExp, string]> = [
    [/^\s*##\s*概要\s*$/gmu, "## 要点"],
    [/^\s*##\s*ポイント\s*$/gmu, "## 要点"],
    [/^\s*##\s*特長\s*$/gmu, "## 要点"],
    [/^\s*##\s*要約\s*$/gmu, "## 要点"],
    [/^\s*##\s*(Call\s*to\s*Action|行動喚起|次のステップ)\s*$/gmu, "## CTA"],
  ];
  for (const [re, rep] of pairs) out = out.replace(re, rep);

  // 必須見出しが欠ける場合は追記（末尾にダミーを追加）
  const hasPoints = /(^|\n)\s*##\s*要点(\s|$)/m.test(out);
  const hasBody = /(^|\n)\s*##\s*本文(\s|$)/m.test(out);
  const hasCTA = /(^|\n)\s*##\s*CTA(\s|$)/m.test(out);
  if (!hasPoints) out += `\n\n## 要点\n- （生成側で要点を列挙してください）`;
  if (!hasBody) out += `\n\n## 本文\n（生成側で本文を記述してください）`;
  if (!hasCTA) out += `\n\n## CTA\n（生成側でCTAを記述してください）`;

  return out.trim();
}

/** ===== サーバー側見出し検証（UI検証用に返却） ===== */
function checkHeadings(md: string) {
  const s = md.replace(/\r\n/g, "\n");
  return {
    h1: /(^|\n)\s*#\s+.+/m.test(s),
    points: /(^|\n)\s*##\s*要点(\s|$)/m.test(s),
    body: /(^|\n)\s*##\s*本文(\s|$)/m.test(s),
    cta: /(^|\n)\s*##\s*CTA(\s|$)/m.test(s),
  };
}

/** ===== 文字化け調査用：ハッシュ/BASE64ヘッド ===== */
function mkDiagnostics(text: string) {
  const buf = Buffer.from(text, "utf8");
  const sha = crypto.createHash("sha256").update(buf).digest("hex");
  const b64 = buf.toString("base64").slice(0, 120);
  return { sha256: sha, b64Head: b64 };
}

/** ===== OpenAI呼び出し ===== */
const MODEL = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/** ===== POST /api/writer ===== */
export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const parsed = InputSchema.safeParse(json);
    if (!parsed.success) {
      return respondJson({ ok: false, error: parsed.error.flatten() }, 400);
    }
    if (!process.env.OPENAI_API_KEY) {
      return respondJson({ ok: false, error: "OPENAI_API_KEY is not set" }, 500);
    }

    const input = parsed.data;
    const system = buildSystemPrompt(input.language);
    const user = buildUserPrompt(input);

    const completion = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.7,
      top_p: 0.9,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content?.trim() ?? "(no content)";
    const text = enforceHeadings(raw);
    const headings = checkHeadings(text);
    const diag = mkDiagnostics(text);

    return respondJson(
      {
        ok: true,
        mock: false,
        model: completion.model || MODEL,
        text,
        meta: {
          template: input.template,
          language: input.language,
          tone: input.tone,
          usage: completion.usage ?? null,
          headings,
          diagnostics: diag,
        },
      },
      200
    );
  } catch (e: any) {
    return respondJson({ ok: false, error: e?.message || "unknown error" }, 500);
  }
}

/** ===== 共通：UTF-8ヘッダで返却（文字化け回避） ===== */
function respondJson(body: any, status = 200) {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
