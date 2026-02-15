// app/api/writer/user-message.ts

import type { NormalizedInput } from "./pipeline";
import { COMMON_BANNED_PATTERNS } from "./prompt/category-safety";

/* =========================
   makeUserMessage (憲章 v1.0 整合版)
   - NormalizedInput → userMessage
   - 目的：L3 編集ルール（出力構成・禁止事項）を user 側でも矛盾なく固定する
   - UI/DB/テンプレには触れない（生成品質のみ）
   - 見出し/FAQ/CTA固定構成は指示しない（憲章と衝突するため）
   - ✅ A）用途から周辺概念を内部補完：状況描写だけ 1つ許可（辞書なし）
   - ✅ A）断定文型固定：ヘッド2文は必ず断定形で終える（可能表現を使わない）
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
    // ✅ A）用途→周辺概念の内部補完（状況描写のみ）
    "【内部補完（許可・制限付き）】",
    "ヘッド2文目（使用シーン）に限り、goal/audience から“状況描写（質感・状態・動作）”を1つだけ補ってよい。",
    "ただし、性能・効果・比較・根拠・数値の断定はしない（事実の追加は禁止）。",
    "状況描写は「手触り・状態・扱い方」に寄せ、効果断定（守る／損なわず／保証する 等）に見える言い回しは避ける。",
    "例：柔らかい／焼きたて／断面／つぶれやすい／パンくず／スライス 等（あくまで例。辞書化しない）。",
    "",
    // ✅ A）断定文型固定（最重要）
    "【文型固定（最重要）】",
    "ヘッド2文は必ず“断定形”で終える（語尾を固定する）。",
    "許可例：〜します／〜保ちます／〜整えます／〜支えます／〜高めます（断定の言い切り）。",
    "禁止：可能表現（〜できます／〜することができます／〜られます／可能です／〜得ます 等）および抽象評価の語尾（〜役立ちます／〜向いています）で終えない。",
    "",
    // 憲章 v1.0：出力構成の強制
    "【出力構成（必須）】",
    "1) ヘッド：2文のみ。",
    "   - 1文目：用途 + 主ベネフィット（断定形で終える／product_name を必ず含める）",
    "   - 2文目：使用シーン（状況描写は1つだけ許可／断定形で終える）",
    "2) ボディ：箇条書き（最大3点）。順番は「コア機能 → 困りごと解消 → 汎用価値」。",
    "3) 補助：入力に objections または cta_preference がある場合のみ、短い追記を1〜2行で許可。無い場合は絶対に出さない。",
    "",
    // 憲章 v1.0：禁止
    "【禁止】",
    "- 見出し（## や「【】見出し」等）を出さない。",
    "- ヘッドで説明・前置き・水増しをしない（例：「重要」「サポート」「〜でしょう」等）。",
    "- 抽象まとめ・同義反復をしない。",
    "- 不足情報を想像で補わない。分からない要素は触れない（内部補完は“状況描写1つ”のみ例外）。",
    "- 入力に無い“効果の強化・問題解決の断定（〜を防ぎます／解消します／守ります 等）”を追加しない。",
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
