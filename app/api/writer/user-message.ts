// app/api/writer/user-message.ts

import type { NormalizedInput } from "./pipeline";
import { COMMON_BANNED_PATTERNS } from "./prompt/category-safety";

/* =========================
   makeUserMessage (憲章 v1.0 整合版)
   - NormalizedInput → userMessage
   - 目的：L3 編集ルール（出力構成・禁止事項）を user 側でも矛盾なく固定する
   - UI/DB/テンプレには触れない（生成品質のみ）
   - 見出し/FAQ/CTA固定構成は指示しない（憲章と衝突するため）
========================= */

type SpecRisk = {
  hasRisk: boolean;
  hits: string[];
};

/**
 * 固有情報リスク検知
 * - 依頼文やキーワード群から、COMMON_BANNED_PATTERNS に含まれるパターンを検出
 * - 結果は userMessage 内の補助情報（spec_risk_flags）として渡す
 *   （APIレスポンス shape は変えない）
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

  // 元の依頼文 + 主要フィールド
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
      if (hits.length >= 16) break; // 冗長化防止
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
  if (n.keywords?.length) push("keywords", n.keywords.join(", "));
  if (n.constraints?.length) push("constraints", n.constraints.join(" / "));
  if (n.selling_points?.length) push("selling_points", n.selling_points.join(" / "));
  if (n.objections?.length) push("objections", n.objections.join(" / "));
  if (n.evidence?.length) push("evidence", n.evidence.join(" / "));
  if (n.cta_preference?.length) push("cta_preference", n.cta_preference.join(" / "));

  // 固有情報リスク検知 → ヒントとして埋め込む
  const specRisk = detectSpecRisk(n);
  if (specRisk.hits.length) {
    push("spec_risk_flags", specRisk.hits.join(" / "));
  }

  const metaBlock = kv.length ? kv.join("\n") : "";

  const guide = [
    // 役割
    "あなたは日本語のEC商品説明を作るプロのライターです。",
    "",
    // 憲章 v1.0：固定入力の厳守
    "【固定された事実】",
    "以下の入力（product_name/category/goal/audience/keywords/selling_points/constraints/evidence 等）だけを根拠に書いてください。",
    "入力に無い固有情報（数値・型番・受賞・ランキング・保証条件・価格・レビュー等）は推測で足さないでください。",
    "",
    // 憲章 v1.0：出力構成の強制
    "【出力構成（必須）】",
    "1) ヘッド：2文のみ。",
    "   - 1文目：用途 + 主ベネフィット",
    "   - 2文目：使用シーン",
    "2) ボディ：箇条書き（最大3点）。順番は「コア機能 → 困りごと解消 → 汎用価値」。",
    "3) 補助：入力に objections または cta_preference がある場合のみ、短い追記を1〜2行で許可。無い場合は絶対に出さない。",
    "",
    // 憲章 v1.0：禁止
    "【禁止】",
    "- 見出し（## や「【】見出し」等）を出さない。",
    "- ヘッドで説明・前置き・水増しをしない（例：「重要」「サポート」「〜でしょう」等）。",
    "- 抽象まとめ・同義反復をしない。",
    "- 不足情報を想像で補わない。分からない要素は触れない。",
    "",
    // 仕上げ
    "【出力】",
    "本文のみを出力し、注釈・自己評価・手順・コードブロックは書かない。",
  ].join("\n");

  const parts: string[] = [];

  if (metaBlock) {
    parts.push("INPUT\n" + metaBlock);
  }

  const raw = (n._raw ?? "").toString().trim();
  if (raw) {
    parts.push("RAW\n" + raw);
  }

  parts.push("INSTRUCTION\n" + guide);

  return parts.join("\n\n");
}
