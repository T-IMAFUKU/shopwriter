// app/api/writer/tone-utils.ts

/* =========================
   Article Type ユーティリティ
   - 旧雰囲気制御ではなく、文章の役割・型を解決する
   - ファイル名は既存 import 経路維持のため tone-utils.ts のまま使う
   - 無指定時は product_page を既定にする
========================= */

export type ArticleType = "product_page" | "recommend" | "faq" | "announcement";

const ARTICLE_TYPE_ALIASES: Record<string, ArticleType> = {
  product_page: "product_page",
  product: "product_page",
  productpage: "product_page",
  product_intro: "product_page",
  default: "product_page",
  standard: "product_page",
  商品ページ用: "product_page",
  商品ページ: "product_page",

  recommend: "recommend",
  recommendation: "recommend",
  recommended: "recommend",
  audience_recommend: "recommend",
  こんな人におすすめ: "recommend",
  おすすめ: "recommend",

  faq: "faq",
  qa: "faq",
  q_and_a: "faq",
  qanda: "faq",
  よくある質問: "faq",
  質問: "faq",

  announcement: "announcement",
  notice: "announcement",
  news: "announcement",
  new_arrival: "announcement",
  新商品: "announcement",
  入荷案内: "announcement",
  新商品入荷案内: "announcement",
  新商品・入荷案内: "announcement",
};

function normalizeKey(raw: unknown): string {
  return (raw ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[\s\-–—_]+/g, "_");
}

export function normalizeArticleType(raw: unknown): ArticleType | null {
  const key = normalizeKey(raw);
  if (!key) return null;
  return ARTICLE_TYPE_ALIASES[key] ?? null;
}

export function resolveArticleType(...candidates: unknown[]): ArticleType {
  for (const candidate of candidates) {
    const resolved = normalizeArticleType(candidate);
    if (resolved) return resolved;
  }
  return "product_page";
}

export function getArticleTypeLabel(articleType: ArticleType): string {
  switch (articleType) {
    case "recommend":
      return "こんな人におすすめ";
    case "faq":
      return "よくある質問";
    case "announcement":
      return "新商品・入荷案内";
    default:
      return "商品ページ用";
  }
}

/* =========================
   System Prompt（文章タイプ統合）
========================= */

export function buildSystemPrompt(opts?: {
  overrides?: string;
}): string {
  const extra = (opts?.overrides ?? "").toString().trim();

  const modules = [
    "あなたはEC特化の日本語コピーライターAIです。敬体（です・ます）で、落ち着いた知性を保ち、読み手を尊重します。感情的な煽りや誇大広告は避け、事実ベースで具体的に伝えます。読み手に急いで行動を迫る、押し売り調の見出し（例:「さあ、今すぐ〜」など）は避け、穏やかに案内してください。",
    "【文章タイプ】ユーザーが選んだ文章タイプの役割を優先してください。文章タイプは雰囲気差ではなく、商品ページ用・おすすめ対象・Q&A・新商品案内のような文章の型と役割の違いです。",
    "【自然な日本語】本文は自然な日本語を最優先します。型を守るために不自然な言い回しや、説明くさい固定文にしないでください。",
    "【捏造禁止】ユーザー入力や商品情報に無い『数値・仕様・比較結果・No.1表現・効能』は作らないでください。数値や仕様が入力にある場合のみ、それを根拠として具体的に書いてください。入力が薄い場合は、嘘にならない範囲で使う場面や選びやすさを自然に補ってください。",
    "不自然なキーワード羅列は禁止です。単語の詰め込みではなく、自然な言い換え・共起語を使ってください。",
    "CTAが求められている場合は、購入や申し込みなど主目的に直結した行動を穏やかに案内してください。代替CTAは低負荷の行動（比較検討、保存、別商品確認など）を提案します。ただし過度な断定は避けます。",
    "医薬的効能の断定、根拠のないNo.1表現、過度な断言、感嘆符の多用は禁止です。保証・返品・相性に関する不安は、必要な場合のみ短く触れてください。",
    "【厳格条件】感嘆符は使用しません。語尾・表記揺れ・冗長な繰り返しは整えてください。文体は 'です・ます' で統一します。",
    "ユーザーが指定した商品・サービス・店舗・ブランド名をそのまま用い、別の名前や別の商品に置き換えないでください。固有名詞を別の企業名や別ブランド名に差し替えたり、別の商品に飛び換えたりしないでください。",
  ];

  if (extra.length > 0) {
    modules.push(`【追加指示】
${extra}`);
  }

  return modules.join("\n\n");
}
