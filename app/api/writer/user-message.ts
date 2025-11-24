// app/api/writer/user-message.ts

import type { NormalizedInput } from "./pipeline";

/* =========================
   makeUserMessage
   - NormalizedInput から userMessage を生成
   - 空の値は行ごと出さない
   - 「情報不足なので作れません」と
     モデルが言い出さないようにガイドを強化
========================= */

export function makeUserMessage(n: NormalizedInput): string {
  const kv: string[] = [];

  const push = (label: string, value: string | null | undefined) => {
    const v = (value ?? "").toString().trim();
    if (!v) return;
    kv.push(`${label}: ${v}`);
  };

  // 単一値（空なら行ごとスキップ）
  push("product_name", n.product_name);
  push("category", n.category);
  push("goal", n.goal);
  push("audience", n.audience);
  push("platform", n.platform ?? null);
  push("brand_voice", n.brand_voice ?? null);
  push("tone", n.tone ?? null);
  push("style", n.style ?? null);
  push("length_hint", n.length_hint ?? null);

  // 配列系は中身があるときだけ 1 行にまとめる
  if (n.keywords?.length) {
    push("keywords", n.keywords.join(", "));
  }
  if (n.constraints?.length) {
    push("constraints", n.constraints.join(", "));
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
    "上記の条件に基づいて、日本語で媒体最適化した本文を作成してください。" +
    "条件が不足している場合でも、合理的に想像して不足を補い、LPとして成立する本文から書き始めてください。" +
    "「情報が不足しているため作成できません」や、情報不足を理由とした謝罪・お断りの文章は書かないでください。" +
    "必要に応じて見出し(H2まで)と箇条書きを用い、FAQは2〜3問をQ/A形式で、最後に一次CTAと代替CTAを示してください。" +
    "感嘆符は使わず、数値・単位を最低2つ含めてください。" +
    "読者に急いで行動を迫る押し売りの見出し（例:「さあ、〜してください」など）は避け、落ち着いた言い回しにしてください。";

  const parts: string[] = [];

  if (metaBlock) {
    parts.push("# 入力", metaBlock);
  }

  parts.push("# 指示", guide);

  return parts.join("\n\n");
}
