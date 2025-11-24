// app/api/writer/user-message.ts

import type { NormalizedInput } from "./pipeline";

/* =========================
   makeUserMessage (P1-7 修正版)
   - NormalizedInput → userMessage
   - ドメイン固定の強化
   - 謝罪・情報不足系の完全排除
   - LP本文から自然に開始させる
   - Phase1 安全範囲での最大効果
========================= */

export function makeUserMessage(n: NormalizedInput): string {
  const kv: string[] = [];

  const push = (label: string, value: string | null | undefined) => {
    const v = (value ?? "").toString().trim();
    if (!v) return;
    kv.push(`${label}: ${v}`);
  };

  // 単一値
  push("product_name", n.product_name);
  push("category", n.category);
  push("goal", n.goal);
  push("audience", n.audience);
  push("platform", n.platform ?? null);
  push("brand_voice", n.brand_voice ?? null);
  push("tone", n.tone ?? null);
  push("style", n.style ?? null);
  push("length_hint", n.length_hint ?? null);

  // 配列系
  if (n.keywords?.length) {
    push("keywords", n.keywords.join(", "));
  }
  if (n.constraints?.length) {
    push("constraints", n.constraints.join(" / "));
  }
  if (n.selling_points?.length) {
    push("selling_points", n.selling_points.join(" / "));
  }
  if (n.objections?.length) {
    push("objections", n.objections.join(" / "));
  }
  if (n.evidence?.length) {
    push("evidence", n.evidence.join(" / "));
  }
  if (n.cta_preference?.length) {
    push("cta_preference", n.cta_preference.join(" / "));
  }

  const metaBlock = kv.length ? kv.join("\n") : "";

  const guide =
    "あなたは日本語のECライティングに特化したプロのライターです。" +
    "以下の入力情報（特に product_name・category・keywords）は、この文章全体の前提となる“固定された事実”です。これらと矛盾する情報や、別カテゴリの商品例（例: コーヒー、サプリ、家電、調味料など）は、たとえ元の依頼文に含まれていても無視してください。" +
    "本文は、指定された product_name と category のドメインに完全に従って書いてください。" +
    "また、条件が不足している場合でも、category の範囲を越えない形で合理的に補完し、本文の導入コピーから自然に書き始めてください。" +
    "「情報が不足しています」「可能な範囲で」などの保険的・謝罪的な導入文は禁止です。" +
    "本文の構成は、導入 → ベネフィット → 特徴箇条書き → FAQ（2〜3問） → 最後に一次CTAと代替CTA、という順序で自然に記述してください。" +
    "感嘆符は使わず、数値・単位を最低2つ含め、押し売りの見出し表現（例:「さあ、〜してください」）は避けてください。";

  const parts: string[] = [];

  if (metaBlock) {
    parts.push("# 入力", metaBlock);
  }

  const raw = (n._raw ?? "").toString().trim();
  if (raw) {
    parts.push("# 元の依頼文", raw);
  }

  parts.push("# 指示", guide);

  return parts.join("\n\n");
}
