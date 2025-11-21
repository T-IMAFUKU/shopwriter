// app/api/writer/user-message.ts

import type { NormalizedInput } from "./pipeline";

/* =========================
   makeUserMessage
   - NormalizedInput から userMessage を生成
   - 元の pipeline.ts の実装を完全移植（挙動不変）
========================= */

export function makeUserMessage(n: NormalizedInput): string {
  const kv = [
    `product_name: ${n.product_name}`,
    `category: ${n.category}`,
    `goal: ${n.goal}`,
    `audience: ${n.audience}`,
    n.platform ? `platform: ${n.platform}` : null,
    n.keywords.length ? `keywords: ${n.keywords.join(", ")}` : null,
    n.constraints.length
      ? `constraints: ${n.constraints.join(", ")}`
      : null,
    n.brand_voice ? `brand_voice: ${n.brand_voice}` : null,
    n.tone ? `tone: ${n.tone}` : null,
    n.style ? `style: ${n.style}` : null,
    n.length_hint ? `length_hint: ${n.length_hint}` : null,
    n.selling_points.length
      ? `selling_points: ${n.selling_points.join(" / ")}`
      : null,
    n.objections.length
      ? `objections: ${n.objections.join(" / ")}`
      : null,
    n.evidence.length
      ? `evidence: ${n.evidence.join(" / ")}`
      : null,
    n.cta_preference.length
      ? `cta_preference: ${n.cta_preference.join(" / ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const guide =
    "上記の条件に基づいて、日本語で媒体最適化した本文を作成してください。必要に応じて見出し(H2まで)と箇条書きを用い、FAQは2〜3問をQ/A形式で、最後に一次CTAと代替CTAを示してください。感嘆符は使わず、数値・単位を最低2つ含めてください。読者に急いで行動を迫る押し売りの見出し（例:『さあ、〜してください』など）は避け、落ち着いた言い回しにしてください。";

  return `# 入力\n${kv}\n\n# 指示\n${guide}`;
}
