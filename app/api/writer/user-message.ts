// app/api/writer/user-message.ts

import type { NormalizedInput } from "./pipeline";
import { COMMON_BANNED_PATTERNS } from "./prompt/category-safety";

/* =========================
   makeUserMessage (P2-3 修正版)
   - NormalizedInput → userMessage
   - ドメイン固定の強化（Phase1仕様維持）
   - 謝罪・情報不足系の完全排除
   - LP本文から自然に開始させる
   - 推測禁止・固有情報制御のガイドラインを追加
   - COMMON_BANNED_PATTERNS を用いた固有情報リスク検知
========================= */

type SpecRisk = {
  hasRisk: boolean;
  hits: string[];
};

/**
 * 固有情報リスク検知
 * - 依頼文やキーワード群から、COMMON_BANNED_PATTERNS に含まれるパターンを検出
 * - 結果は metaBlock の spec_risk_flags としてヒント提供に使う
 *   （APIレスポンス shape は変えず、プロンプト内の情報だけ強化）
 */
function detectSpecRisk(n: NormalizedInput): SpecRisk {
  const segments: string[] = [];

  const pushSeg = (v: unknown) => {
    if (!v) return;
    if (Array.isArray(v)) {
      for (const item of v) {
        const s = (item ?? "").toString().trim();
        if (s) segments.push(s);
      }
      return;
    }
    const s = (v ?? "").toString().trim();
    if (s) segments.push(s);
  };

  // 元の依頼文 + 主要フィールドをざっくり対象にする
  pushSeg((n as any)._raw);
  pushSeg(n.product_name);
  pushSeg(n.category);
  pushSeg(n.goal);
  pushSeg(n.keywords);
  pushSeg(n.selling_points);
  pushSeg(n.evidence);
  pushSeg(n.constraints);

  if (!segments.length) {
    return { hasRisk: false, hits: [] };
  }

  const haystack = segments.join(" ").toLowerCase();
  const hits: string[] = [];

  for (const rawPattern of COMMON_BANNED_PATTERNS) {
    const p = rawPattern.toLowerCase().trim();
    if (!p) continue;
    if (haystack.includes(p)) {
      hits.push(rawPattern);
      if (hits.length >= 16) break; // プロンプトが冗長になりすぎないように上限
    }
  }

  const uniqueHits = Array.from(new Set(hits));
  return { hasRisk: uniqueHits.length > 0, hits: uniqueHits };
}

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

  // 固有情報リスク検知 → meta にヒントとして埋め込む
  const specRisk = detectSpecRisk(n);
  if (specRisk.hits.length) {
    push("spec_risk_flags", specRisk.hits.join(" / "));
  }

  const metaBlock = kv.length ? kv.join("\n") : "";

  const guide =
    "あなたは日本語のECライティングに特化したプロのライターです。" +
    "以下の入力情報（特に product_name・category・keywords）は、この文章全体の前提となる“固定された事実”です。これらと矛盾する情報や、別カテゴリの商品例（例: コーヒー、サプリ、家電、調味料など）は、たとえ元の依頼文に含まれていても無視してください。" +
    "本文は、指定された product_name と category のドメインに完全に従って書いてください。" +
    "また、条件が不足している場合でも、category の範囲を越えない形で合理的かつ一般的なレベルにとどめて補完し、本文の導入コピーから自然に書き始めてください。" +
    "「情報が不足しています」「可能な範囲で」などの保険的・謝罪的な導入文は禁止です。" +
    "本文の構成は、導入 → ベネフィット → 特徴箇条書き → FAQ（2〜3問） → 最後に一次CTAと代替CTA、という順序で自然に記述してください。" +
    "感嘆符は使わず、押し売りの見出し表現（例:「さあ、〜してください」）は避けてください。" +
    "容量・成分・原材料・寸法・重量・バッテリー持続時間・ストレージ容量・解像度・型番・発売日・価格・割引率・ポイント還元率・レビュー件数・星評価・ランキングなどの具体的な数値やスペックは、入力情報に明示されている場合のみ使用し、新たに推測して書かないでください。" +
    "ml・g・cm・時間・％ などの具体的な数値や単位、または特定の型番・カラー名・シリーズ名・キャンペーン名・受賞歴・認証マークなどの固有情報を、依頼文にない形ででっち上げないでください。" +
    "具体的な数値が与えられていない場合は、「たっぷり」「持ち運びしやすいサイズ」「長時間快適に使えるよう設計」など、一般的で曖昧な表現にとどめてください。";

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
