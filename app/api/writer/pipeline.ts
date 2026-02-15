// app/api/writer/pipeline.ts
import { NextResponse } from "next/server";
import { sha256Hex, logEvent, forceConsoleEvent, emitWriterEvent } from "./_shared/logger";
import { buildOpenAIRequestPayload, callOpenAI } from "./openai-client";
import { resolveTonePresetKey, buildSystemPrompt } from "./tone-utils";
import { makeUserMessage } from "./user-message";
import type { ProductContext } from "@/server/products/repository";
import { logProductContextStatus } from "./logger";
import { buildPrecisionProductPayload, buildProductFactsDto } from "@/server/products/dto";
import { buildProductFactsBlock } from "./prompt/product-facts";
import { applyPostprocess } from "./postprocess";

// ✅ densityA（観測＋同点タイブレーク＋低密度救済）
// - export名が違っても落ちないように namespace import + any で呼ぶ
import * as DensityA from "@/lib/densityA";

/**
 * 目的（新設計）:
 * - Pipeline は 3工程（Normalize / Decide / Handoff）に縮退
 * - ✅ 生成品質を安定させるため「内部3案生成→L3スコア→最良案採用」を Handoff 内で行う
 * - ✅ 同点時は densityA（情報使用率）をタイブレークに使う（L3最優先は維持）
 * - ✅ 低密度（inputCount=4 で 1要素でも落ちる等）を救済するため、最大1回だけ追加生成(idx4)を許可
 * - ✅ “プロンプトで使用強制” を追加し、設計を守りつつ密度が薄い勝ち方を減らす（Case3対策）
 * - ✅ C-2（本丸）：mustUse の対象セットを「事実/仕様寄り」に限定し、評価語っぽい selling_points は任意素材へ落とす
 * - CTAのSSOT: ctx.flags.cta.mode ("on" | "off")
 * - CTAブロック仕様SSOT: ctx.contracts.ctaBlock（仕様のみ。生成は他責務）
 * - ✅ 実運用上必要なので applyPostprocess() は “返却直前” にのみ適用する（data.text / output を同一に固定）
 * - ✅ さらに “最終返却の直前” に repair を必ず通し、UI/モデル差に依存しない改行を担保する
 */

/* =========================
   Normalized Input（route.ts と同形）
========================= */

export type NormalizedInput = {
  product_name: string;
  category: string;
  goal: string;
  audience: string;
  platform?: string | null;
  keywords: string[];
  constraints: string[];
  brand_voice?: string | null;
  tone?: string | null;
  style?: string | null;
  length_hint?: string | null;
  selling_points: string[];
  objections: string[];
  evidence: string[];
  cta_preference: string[];
  _raw?: string;
};

/* =========================
   Writer Errors
========================= */

export type WriterErrorReason =
  | "validation"
  | "content_policy"
  | "openai"
  | "openai_api_error"
  | "openai_empty_content"
  | "timeout"
  | "rate_limit"
  | "bad_request"
  | "internal";

export type WriterPipelineError = {
  ok: false;
  reason: WriterErrorReason;
  message: string;
  code?: string;
  meta?: Record<string, unknown>;
};

export type WriterPipelineOk = {
  ok: true;
  ctx: WriterPipelineCtx;
  openai: {
    content: string;
    apiMs: number;
    status: number;
    statusText: string;
  };
};

export type WriterPipelineResult = WriterPipelineOk | WriterPipelineError;

/* =========================
   SSOT（CTA / Contracts）
========================= */

export type CtaMode = "on" | "off";

export type CtaBlockContract = {
  heading: "おすすめのアクション";
  variants: readonly ["おすすめのアクション", "おすすめアクション", "おすすめの行動"];
  placement: {
    atEnd: true;
    withinLastLines: 30;
  };
  bulletRules: {
    minBulletLines: 2;
  };
};

export type WriterPipelineCtx = {
  request: {
    requestId: string;
    route: "/api/writer";
    provider?: string;
    model?: string;
    temperature: number;
    t0: number;
  };
  input: {
    rawPrompt: string;
    normalized: NormalizedInput;
    productId?: string | null;
    productContext?: ProductContext | null;
    templateKey: string;
    isSNS: boolean;
    toneKey: string;
  };
  flags: {
    cta: {
      mode: CtaMode;
    };
  };
  contracts: {
    ctaBlock: CtaBlockContract;
  };
  prompts: {
    system: string;
    user: string;
    debug?: {
      baseSystemLength: number;
      userLength: number;
      systemHash8: string;
      userHash8: string;
      hasProductFacts: boolean;
    };
  };
  product: {
    precisionPayload: ReturnType<typeof buildPrecisionProductPayload>;
    productFacts: ReturnType<typeof buildProductFactsDto>;
    productFactsBlock: string | null;
  };
};

/* =========================
   Normalize
========================= */

function resolveTemplateKey(n: NormalizedInput): string {
  const metaTemplate = (n as any)?.meta?.template;
  const platform = (n as any)?.platform;
  const raw = (metaTemplate ?? platform ?? "").toString().trim().toLowerCase();
  return raw || "lp";
}

function isSnsLikeTemplate(templateKey: string): boolean {
  return /sns/.test(templateKey) || /sns_short/.test(templateKey);
}

function parseBooleanLike(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") {
    if (v === 1) return true;
    if (v === 0) return false;
    return null;
  }
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["true", "1", "on", "yes", "y"].includes(s)) return true;
    if (["false", "0", "off", "no", "n"].includes(s)) return false;
  }
  return null;
}

function resolveCtaMode(n: NormalizedInput): CtaMode {
  const candidates = [(n as any)?.meta?.cta, (n as any)?.metaCta, (n as any)?.ctaEnabled, (n as any)?.cta];
  for (const c of candidates) {
    const b = parseBooleanLike(c);
    if (b !== null) return b ? "on" : "off";
  }
  return "on";
}

/* =========================
   Decide（L3を生成に強制）
========================= */

/**
 * ✅ C-2: mustUse対象を「事実/仕様寄り」に限定する
 *
 * 方針（辞書メンテ破綻を避ける）:
 * - “評価語”を列挙して増やし続けない（永遠メンテになる）
 * - mustUse に入れる selling_points は「根拠シグナルがある行」だけ
 *   - 数値/単位（強い）
 *   - 仕様っぽい “最小の固定マーカー” （増やす運用にしない）
 * - それ以外は任意素材（入力としては尊重するが強制しない）
 */

function normalizeJaText(s: unknown): string {
  return (s ?? "").toString().replace(/\s+/g, " ").trim();
}

function uniqueNonEmptyStrings(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of list) {
    const s = normalizeJaText(x);
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function truncateJoinQuoted(items: string[], maxItems: number): string {
  const xs = (items ?? []).slice(0, Math.max(0, maxItems));
  if (xs.length === 0) return "";
  return xs.map((x) => `「${x}」`).join("、");
}

/**
 * 文字化け疑い（観測安定化）
 * - ✅ “スペース”では判定しない（通常入力に含まれる）
 * - “判定不能っぽい” ものだけを mustUse から外す
 */
function looksMojibakeLike(line: string): boolean {
  const s = (line ?? "").toString();
  if (!s) return false;

  // 置換文字（典型）
  if (s.includes("�")) return true;

  // よくある mojibake パターン（ログで観測された系）
  if (/[繧繝]/.test(s)) return true;

  // 半角カナの連続（UTF-8誤デコードで出やすい）
  const hwKanaRuns = s.match(/[ｦ-ﾟ]{2,}/g);
  if (hwKanaRuns && hwKanaRuns.length > 0) return true;

  return false;
}

function classifySellingPoints(points: string[]): { facts: string[]; optional: string[] } {
  const src = uniqueNonEmptyStrings(points);

  // “根拠シグナル”として強いもの（辞書ではなくパターン中心）
  const UNIT_OR_NUMBER_RE =
    /[0-9０-９]+|%|％|mm|cm|m|g|kg|mg|ml|mL|l|L|W|w|V|v|Hz|kHz|lm|ルーメン|インチ|時間|分|秒|年|回|段階/;

  // 仕様マーカー（固定・最小：増やす運用にしない）
  const SPEC_MARKERS_RE = /(可動|調整|角度|高さ|明るさ|LED|USB|Type-?C|Bluetooth|Wi-?Fi)/;

  const hasEvidenceSignal = (s: string): boolean => {
    if (!s) return false;
    if (UNIT_OR_NUMBER_RE.test(s)) return true;
    if (SPEC_MARKERS_RE.test(s)) return true;
    return false;
  };

  const facts: string[] = [];
  const optional: string[] = [];

  for (const p of src) {
    // 文字化け疑いは mustUse に入れない（任意素材）
    if (looksMojibakeLike(p)) {
      optional.push(p);
      continue;
    }

    // ✅ C-2の核：根拠シグナルがある行だけを “事実/仕様寄り” として採用
    if (hasEvidenceSignal(p)) {
      facts.push(p);
      continue;
    }

    // それ以外（評価語っぽい／抽象／感想系が混ざる）は任意素材
    optional.push(p);
  }

  return { facts, optional };
}

/**
 * ✅ densityA は「必須セット」だけで評価する（C-2整合）
 * - 任意素材（optional selling_points）を densityA の入力セットに含めない
 *
 * ✅ InputSet揺れ防止（本丸）:
 * - UI上 selling_points が入力されているなら、densityA は必ず inputCount=4（= 3 + 1）に固定する
 * - “事実/仕様寄り” が0件でも、入力がある限り先頭1件をフォールバック採用（意味判定なし／辞書なし）
 * - threshold 側が 3/4 を前提にしているため、ここで selling_points を最大1件に丸める
 */
function normalizedForDensityA(normalized: NormalizedInput): NormalizedInput {
  const sellingPointsRaw = Array.isArray(normalized.selling_points) ? normalized.selling_points : [];
  const src = uniqueNonEmptyStrings(sellingPointsRaw);

  if (src.length === 0) {
    // v0: 必須3（product_name/goal/audience）
    return { ...normalized, selling_points: [] };
  }

  const classified = classifySellingPoints(src);
  const pick = classified.facts[0] ?? src[0]; // ✅ 入力がある限り 1件は必ず採用（4固定）
  const one = pick ? [pick] : [];

  return {
    ...normalized,
    selling_points: one,
  };
}

/**
 * ✅ 生成側（辞書なし）：audience 原文が欠けたら返却直前に1回だけ保証する
 * - すでに含まれているなら何もしない
 * - 無ければ「ヘッド2文の2文目」の先頭に差し込む（説明は足さない）
 */
function enforceAudienceExactOnce(text: string, audienceRaw: string): { text: string; didEnforce: boolean } {
  const audience = (audienceRaw ?? "").toString().trim();
  if (!audience) return { text: (text ?? "").toString(), didEnforce: false };

  const t = (text ?? "").toString().replace(/\r\n/g, "\n").trim();
  if (!t) return { text: t, didEnforce: false };

  // 既に含まれているならOK（1回だけは、ここでは強制しない＝過剰削除リスクを避ける）
  if (t.includes(audience)) return { text: t, didEnforce: false };

  const { head, body } = splitHeadAndBody(t);
  if (!head) return { text: t, didEnforce: false };

  // ヘッド2文に寄せて、2文目があればその先頭へ。無ければ末尾へ短く付与。
  const parts = head
    .split("。")
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    const head1 = `${parts[0]}。`;
    const head2 = parts[1] ?? "";
    const injected2 = head2 ? `${audience}の${head2}` : `${audience}の作業中に使います`;
    const rebuiltHead = `${head1}\n${injected2}。`.trim();
    const rebuilt = body ? `${rebuiltHead}\n\n${body}`.trim() : rebuiltHead;
    return { text: rebuilt, didEnforce: true };
  }

  // 1文しか無い場合（例外）: 末尾に一言だけ足す
  const rebuiltHead = `${head}\n${audience}の作業中に使います。`.trim();
  const rebuilt = body ? `${rebuiltHead}\n\n${body}`.trim() : rebuiltHead;
  return { text: rebuilt, didEnforce: true };
}

/* =========================
   Output Rules Suffix（責務境界固定）
========================= */

type OutputRulesSuffixCtx = {
  isSNS: boolean;
  pn: string;

  goal: string;
  audience: string;
  category: string;
  sellingPoints: string[];

  hasGoal: boolean;
  hasAudience: boolean;
  hasCategory: boolean;

  forcedSellingPoints: string[];
  optionalSellingPoints: string[];
  hasForcedSellingPoints: boolean;
  hasOptional: boolean;
};

function buildUseForceLines(ctx: OutputRulesSuffixCtx): string[] {
  const useForceLines: string[] = [
    "",
    "使用強制（必須・ラベル禁止）:",
    "- 次の要素を、本文の自然な日本語として必ず反映する（項目名は書かない / 例:「goal:」禁止）。",
    `- product_name：必須（1文目に含める）${ctx.pn ? `（"${ctx.pn}"を省略しない）` : ""}`,
  ];

  if (ctx.hasGoal) {
    useForceLines.push("- goal（用途/目的）：必ず1回以上反映（言い換え可、説明調にしない）。");
  } else {
    useForceLines.push("- goal（用途/目的）：入力が空の場合は“想像で補わない”。");
  }

  // ✅ 生成側の対策（辞書なし）：audience は「原文（完全一致）を1回だけ」必ず含める
  if (ctx.hasAudience) {
    useForceLines.push(
      `- audience（対象/利用者）：原文をそのまま1回だけ必ず含める（完全一致）${
        ctx.audience ? `（"${ctx.audience}"を省略しない）` : ""
      }。言い換えで置き換えない。繰り返し禁止。`,
    );
    useForceLines.push("- audience は、ヘッド2文のどちらかに入れる（箇条書きだけに押し込まない）。");
  } else {
    useForceLines.push("- audience（対象/利用者）：入力が空の場合は“想像で補わない”。");
  }

  // ✅ C-2 本丸：selling_points は “事実/仕様寄り” だけを mustUse 対象にする
  if (ctx.hasForcedSellingPoints) {
    const listText = truncateJoinQuoted(ctx.forcedSellingPoints, 6);
    const minReq = Math.min(2, ctx.forcedSellingPoints.length);
    useForceLines.push(
      `- selling_points（特徴・強み／事実・仕様寄りのみ強制）：以下の中から最低${minReq}点を必ず反映（そのまま or 言い換え可）${
        listText ? `：${listText}` : "。"
      }`,
    );
  } else {
    useForceLines.push("- selling_points（特徴・強み／事実・仕様寄りのみ強制）：入力が空の場合は“想像で補わない”。");
  }

  if (ctx.hasOptional) {
    const listText = truncateJoinQuoted(ctx.optionalSellingPoints, 6);
    useForceLines.push(
      `- selling_points（任意素材／強制しない）：${listText ? `入力に含まれる（例：${listText}）` : "入力に含まれる"}。`,
    );
    useForceLines.push("- 任意素材を使う場合：ヘッドには書かない。本文（箇条書き）のみで“事実（機能/調整/可動/数値等）に寄せて”短く書く。");
    useForceLines.push("- 根拠が無い評価語は、そのまま使わず、事実ベースに言い換える（または触れない）。");
  }

  if (ctx.hasCategory) {
    useForceLines.push("- category：不自然にならない範囲で反映（無理に入れて不自然なら入れない）。");
  }

  useForceLines.push("- 反映は「ヘッド2文 + 箇条書き3点」のどこに入れてもよいが、欠落は禁止。");

  return useForceLines;
}

function buildOutputRulesLines(ctx: OutputRulesSuffixCtx, useForceLines: string[]): string[] {
  return [
    "",
    "---",
    "出力ルール（厳守）:",
    "- 見出し（## 等）を出さない。",
    "- ヘッド2文（用途+主ベネフィット / 使用シーン）→ 箇条書き最大3点（コア機能→困りごと解消→汎用価値）の順に出力する。",
    "- 抽象まとめ・同義反復で水増ししない。",
    "- 短文化は努力目標ではなく制約（余計な説明を足さない）。",
    "- 固有情報は入力にあるもののみ（推測/捏造禁止）。",
    "",
    "ヘッドの制約:",
    `- 1文目は product_name を必ず含める${ctx.pn ? `（"${ctx.pn}"を省略しない）` : ""}。`,
    "- 1文目は「用途+主ベネフィット」を事実ベースで短く書く（説明禁止）。",
    "- 2文目は「使用シーン」のみを書く（説明禁止）。",
    "- ヘッドで「重要」「サポート」「〜でしょう」などの水増し語を入れない。",
    "- ヘッドでは“評価語（快適/使いやすい/目に優しい等）”を書かない。",
    "",
    "ボディ（箇条書き）:",
    "- 箇条書きは最大3点。必ず改行し、1行1点にする（1行に複数要素を詰めない）。",
    "- 順序固定：①コア機能 → ②困りごと解消 → ③汎用価値。",
    "",
    "補助:",
    "- objections/cta_preference が入力にある場合のみ末尾に短く補助（無ければ出さない）。",
    ...useForceLines,
  ];
}

function buildOutputRulesSuffix(normalized: NormalizedInput): string {
  const templateKey = resolveTemplateKey(normalized);
  const isSNS = isSnsLikeTemplate(templateKey);
  const pn = (normalized.product_name ?? "").toString().trim();

  const goal = (normalized.goal ?? "").toString().trim();
  const audience = (normalized.audience ?? "").toString().trim();
  const category = (normalized.category ?? "").toString().trim();
  const sellingPoints = Array.isArray(normalized.selling_points) ? normalized.selling_points : [];

  const hasGoal = Boolean(goal);
  const hasAudience = Boolean(audience);
  const hasCategory = Boolean(category);

  // ✅ C-2: selling_points を分離（事実/仕様寄り＝強制、その他＝任意素材）
  const classified = classifySellingPoints(sellingPoints);
  const forcedSellingPoints = classified.facts;
  const optionalSellingPoints = classified.optional;

  const hasForcedSellingPoints = forcedSellingPoints.length > 0;
  const hasOptional = optionalSellingPoints.length > 0;

  const ctx: OutputRulesSuffixCtx = {
    isSNS,
    pn,
    goal,
    audience,
    category,
    sellingPoints,
    hasGoal,
    hasAudience,
    hasCategory,
    forcedSellingPoints,
    optionalSellingPoints,
    hasForcedSellingPoints,
    hasOptional,
  };

  const useForceLines = buildUseForceLines(ctx);
  const rules = buildOutputRulesLines(ctx, useForceLines).join("\n");

  if (ctx.isSNS) return `${rules}\n- SNS投稿として不自然に長くしない。`;
  return rules;
}

function buildCtaBlockContract(): CtaBlockContract {
  return {
    heading: "おすすめのアクション",
    variants: ["おすすめのアクション", "おすすめアクション", "おすすめの行動"],
    placement: { atEnd: true, withinLastLines: 30 },
    bulletRules: { minBulletLines: 2 },
  } as const;
}

/* =========================
   Internal Scoring（L3違反スコア）
========================= */

type L3ScoreDetail = {
  score: number;
  reasons: string[];
  facts: {
    headSentences: number;
    hasHeading: boolean;
    bulletLines: number;
    hasProductNameInHead1: boolean;
    headHasBannedWord: boolean;
    hasCanDoPhrase: boolean;
    bulletLooksCollapsed: boolean;
  };
};

function splitHeadAndBody(text: string): { head: string; body: string } {
  const t = (text ?? "").toString().replace(/\r\n/g, "\n").trim();
  if (!t) return { head: "", body: "" };
  const idxBullet = t.search(/(^|\n)\s*[・\-]/m);
  if (idxBullet >= 0) return { head: t.slice(0, idxBullet).trim(), body: t.slice(idxBullet).trim() };
  return { head: t, body: "" };
}

function countHeadSentences(head: string): number {
  const h = (head ?? "").toString().trim();
  if (!h) return 0;
  const byMaru = h.split("。").map((s) => s.trim()).filter(Boolean);
  if (byMaru.length >= 1) return byMaru.length;
  const byLine = h.split("\n").map((s) => s.trim()).filter(Boolean);
  return byLine.length;
}

function extractHead1(head: string): string {
  const h = (head ?? "").toString().trim();
  if (!h) return "";
  const i = h.indexOf("。");
  if (i >= 0) return h.slice(0, i + 1);
  const line = h.split("\n").map((s) => s.trim()).filter(Boolean)[0] ?? "";
  return line;
}

function collectBulletLines(body: string): string[] {
  const b = (body ?? "").toString().replace(/\r\n/g, "\n").trim();
  if (!b) return [];
  return b
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((ln) => /^[・\-]\s*/.test(ln));
}

/**
 * ✅ repair（最小・安全）
 * - 1行詰め込み（・A・B・C / ・ A・ B・ C）→ 1行1点に分解
 * - その後、必ず「最大3点」に丸める（②型を安定して勝たせるため）
 * - 返すのは“本文だけ”のまま（付与はしない）
 *
 * 重要:
 * - 「保温・保冷」のような “語彙中点” は極力分割しない
 * - 分割対象は「箇条書きの詰め込み」と判断できる区切り中点のみ
 */
function repairBulletsToMax3(text: string): { text: string; didRepair: boolean } {
  const raw = (text ?? "").toString().replace(/\r\n/g, "\n").trim();
  if (!raw) return { text: raw, didRepair: false };

  const { head, body } = splitHeadAndBody(raw);
  if (!body) return { text: raw, didRepair: false };

  const lines = body.split("\n").map((s) => s.trim()).filter(Boolean);

  let didRepair = false;
  const repairedBullets: string[] = [];
  const tailLines: string[] = [];

  const looksLikeSeparatorStart = (s: string): boolean => {
    const t = (s ?? "").toString().trim();
    if (!t) return false;

    if (/^[0-9A-Za-z]/.test(t)) return true;
    if (/^[「『（(【]/.test(t)) return true;
    if (/^(?:.{1,12}?)(?:を|が|に|で|と|の|や|へ|も|な)/.test(t)) return true;
    if (/^(?:し|でき|なる|保て|守れ|使え)/.test(t)) return true;

    return false;
  };

  const splitCollapsedBullet = (stripped: string): string[] => {
    const s = (stripped ?? "").toString().trim();
    if (!s) return [];

    const dotCount = (s.match(/・/g) ?? []).length;
    if (dotCount <= 1) return [s];

    const parts: string[] = [];
    let buf = "";

    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch !== "・") {
        buf += ch;
        continue;
      }

      const right = s.slice(i + 1);
      const rightTrimmed = right.replace(/^[ \t\u3000]+/, "");
      const isSeparator = looksLikeSeparatorStart(rightTrimmed);

      if (isSeparator) {
        const left = buf.trim();
        if (left) parts.push(left);
        buf = "";
        continue;
      }

      buf += ch;
    }

    const last = buf.trim();
    if (last) parts.push(last);

    if (parts.length <= 1) return [s];

    return parts;
  };

  for (const ln of lines) {
    const isBullet = /^[・\-]\s*/.test(ln);
    if (!isBullet) {
      tailLines.push(ln);
      continue;
    }

    const bulletMark = ln.startsWith("-") ? "-" : "・";
    const stripped = ln.replace(/^[・\-]\s*/, "").trim();

    const parts = splitCollapsedBullet(stripped);

    if (parts.length >= 2) {
      didRepair = true;
      for (const p of parts) repairedBullets.push(`${bulletMark} ${p}`.trim());
      continue;
    }

    repairedBullets.push(`${bulletMark} ${stripped}`.trim());
  }

  if (repairedBullets.length > 3) {
    didRepair = true;
    repairedBullets.splice(3);
  }

  const rebuiltBody = [...repairedBullets, ...tailLines].join("\n").trim();
  const rebuilt = rebuiltBody ? `${head}\n\n${rebuiltBody}`.trim() : head.trim();

  return { text: rebuilt, didRepair };
}

function scoreByL3Rules(text: string, normalized: NormalizedInput): L3ScoreDetail {
  const reasons: string[] = [];
  let score = 0;

  const t = (text ?? "").toString();
  const { head, body } = splitHeadAndBody(t);

  const hasHeading = /(^|\n)\s*##\s+/m.test(t);
  if (hasHeading) {
    score += 8;
    reasons.push("HAS_HEADING");
  }

  const headSentences = countHeadSentences(head);
  if (headSentences !== 2) {
    score += 8;
    reasons.push(`HEAD_SENTENCES_${headSentences}`);
  }

  const head1 = extractHead1(head);
  const pn = (normalized.product_name ?? "").toString().trim();
  const hasProductNameInHead1 = pn ? head1.includes(pn) : true;
  if (!hasProductNameInHead1) {
    score += 12;
    reasons.push("MISSING_PRODUCT_NAME_IN_HEAD1");
  }

  const bannedHeadWords = [
    "最適",
    "ぴったり",
    "おすすめ",
    "大活躍",
    "便利",
    "快適",
    "楽しめます",
    "楽しむ",
    "嬉しい",
    "安心",
    "重要",
    "サポート",
    "でしょう",
    "思います",
    "適しています",
  ];
  const headHasBannedWord = bannedHeadWords.some((w) => w && head.includes(w));
  if (headHasBannedWord) {
    score += 1;
    reasons.push("HEAD_HAS_BANNED_WORD");
  }

  const hasCanDoPhrase = /できます|することができます/.test(head);
  if (hasCanDoPhrase) {
    score += 1;
    reasons.push("HEAD_HAS_CAN_DO_PHRASE");
  }

  const MAX_REASON_ITEMS = 24;
  const ABSTRACT_SUMMARY_WORDS = ["役立つ", "安心", "最適", "心配が減る", "使いやすい", "活用", "実現します", "便利"];

  const headParts = head.split("。").map((s) => s.trim()).filter(Boolean);
  const head2 = headParts.length >= 2 ? headParts[1] : "";
  if (head2) {
    const hasBadInHead2 =
      ABSTRACT_SUMMARY_WORDS.some((w) => w && head2.includes(w)) ||
      bannedHeadWords.some((w) => w && head2.includes(w)) ||
      /できます|することができます/.test(head2);

    if (hasBadInHead2) {
      score += 6;
      reasons.push("HEAD2_EVALUATIVE_OR_ABSTRACT");
    }
  }

  const scoreAbstractSummaryWords = (headText: string, bodyText: string) => {
    let localScore = 0;
    let hits = 0;

    const HEAD_PENALTY_PER_HIT = 9;
    const BODY_PENALTY_PER_HIT = 2;

    for (const w of ABSTRACT_SUMMARY_WORDS) {
      if (!w) continue;

      if (headText.includes(w)) {
        hits += 1;
        localScore += HEAD_PENALTY_PER_HIT;
        if (reasons.length < MAX_REASON_ITEMS) reasons.push(`ABSTRACT_WORD_HEAD:${w}`);
      }

      if (bodyText.includes(w)) {
        hits += 1;
        localScore += BODY_PENALTY_PER_HIT;
        if (reasons.length < MAX_REASON_ITEMS) reasons.push(`ABSTRACT_WORD_BODY:${w}`);
      }
    }

    if (hits > 0) {
      if (reasons.length < MAX_REASON_ITEMS) reasons.push("HAS_ABSTRACT_SUMMARY_WORD");
    }

    return localScore;
  };

  score += scoreAbstractSummaryWords(head, body);

  const bullets = collectBulletLines(body);
  const bulletLines = bullets.length;

  if (bulletLines === 0) {
    score += 10;
    reasons.push("NO_BULLETS");
  } else if (bulletLines < 3) {
    score += 6 + (3 - bulletLines);
    reasons.push(`TOO_FEW_BULLETS_${bulletLines}`);
  } else if (bulletLines > 3) {
    score += 4 + (bulletLines - 3);
    reasons.push(`TOO_MANY_BULLETS_${bulletLines}`);
  }

  let bulletLooksCollapsed = false;
  for (const ln of bullets) {
    const countDot = (ln.match(/・/g) ?? []).length;
    if (countDot >= 2) {
      bulletLooksCollapsed = true;
      break;
    }
  }
  if (bulletLooksCollapsed) {
    score += 3;
    reasons.push("BULLETS_COLLAPSED_INTO_ONE_LINE");
  }

  const hasFaqLike = /FAQ|よくある質問|Q[:：]/.test(t);
  const hasObjections = Array.isArray((normalized as any).objections) && (normalized as any).objections.length > 0;
  const hasCtaPref =
    Array.isArray((normalized as any).cta_preference) && (normalized as any).cta_preference.length > 0;
  if (hasFaqLike && !(hasObjections || hasCtaPref)) {
    score += 2;
    reasons.push("UNNEEDED_FAQ_LIKE");
  }

  const facts = {
    headSentences,
    hasHeading,
    bulletLines,
    hasProductNameInHead1,
    headHasBannedWord,
    hasCanDoPhrase,
    bulletLooksCollapsed,
  };

  return { score, reasons, facts };
}

function hasAbstractHeadReason(reasons: string[]): boolean {
  return (reasons ?? []).some((r) => typeof r === "string" && r.startsWith("ABSTRACT_WORD_HEAD:"));
}

/* =========================
   densityA helpers（同点タイブレーク / 低密度救済）
========================= */

type DensitySnap = {
  densityA: number | null;
  inputCount: number | null;
  usedCount: number | null;
};

function tryComputeDensityA(normalized: NormalizedInput, outputText: string): DensitySnap {
  try {
    const fn = (DensityA as any)?.evaluateDensityA;
    if (typeof fn !== "function") return { densityA: null, inputCount: null, usedCount: null };

    // ✅ C-2整合：densityA評価は必須セットのみ（ただし selling_points は最大1件だけで 3/4 を固定）
    const densNorm = normalizedForDensityA(normalized);

    const r = fn(densNorm, outputText);
    const densityA = typeof r?.densityA === "number" ? r.densityA : null;
    const inputCount = Array.isArray(r?.inputSet) ? r.inputSet.length : null;
    const usedCount = Array.isArray(r?.usedSet) ? r.usedSet.length : null;
    return { densityA, inputCount, usedCount };
  } catch {
    return { densityA: null, inputCount: null, usedCount: null };
  }
}

/**
 * ✅ threshold（v0改：必須世界=3 or 4 は “欠落なし=1.0”）
 * - 必須が3/4要素のときは 1つでも欠けたら救済対象にする
 * - それ以外は現状値を維持（波及を抑える）
 */
function resolveDensityAThreshold(inputCount: number | null): number {
  if (inputCount === 4) return 1.0;
  if (inputCount === 3) return 1.0;
  return 0.34;
}

/* =========================
   Candidate selection（L3最優先 → 同点なら densityA → 短い方）
========================= */

type Candidate = {
  idx: number;
  content: string;
  apiMs: number;
  status: number;
  statusText: string;
};

type ScoredCandidate = Candidate & {
  didRepair: boolean;
  score: number;
  reasons: string[];
  facts: L3ScoreDetail["facts"];
  densityA: number | null;
  inputCount: number | null;
  usedCount: number | null;
  contentLen: number;
  contentHash8: string;
};

function chooseBestCandidate(
  candidates: Candidate[],
  normalized: NormalizedInput,
): { best: ScoredCandidate; scored: ScoredCandidate[] } {
  const repaired = candidates.map((c) => {
    const r = repairBulletsToMax3(c.content);
    return { ...c, content: r.text, didRepair: r.didRepair };
  });

  const scored: ScoredCandidate[] = repaired.map((c) => {
    const detail = scoreByL3Rules(c.content, normalized);
    const dens = tryComputeDensityA(normalized, c.content);
    return {
      ...c,
      score: detail.score,
      reasons: detail.reasons,
      facts: detail.facts,
      densityA: dens.densityA,
      inputCount: dens.inputCount,
      usedCount: dens.usedCount,
      contentLen: c.content.length,
      contentHash8: sha256Hex(c.content).slice(0, 8),
    };
  });

  const preferencePenalty = (facts: L3ScoreDetail["facts"]) => {
    let p = 0;
    if (facts.headSentences !== 2) p += 5;
    if (!facts.hasProductNameInHead1) p += 6;
    if (facts.hasHeading) p += 3;
    if (facts.bulletLines !== 3) p += 4;
    if (facts.bulletLooksCollapsed) p += 2;
    return p;
  };

  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;

    const pa = preferencePenalty(a.facts);
    const pb = preferencePenalty(b.facts);
    if (pa !== pb) return pa - pb;

    const da = typeof a.densityA === "number" ? a.densityA : -1;
    const db = typeof b.densityA === "number" ? b.densityA : -1;
    if (da !== db) return db - da;

    return a.contentLen - b.contentLen;
  });

  return { best: scored[0], scored };
}

/* =========================
   densityA Observe（観測のみ・副作用なし）
========================= */

function limit20(s: unknown): string {
  return (s ?? "").toString().slice(0, 20);
}

function observeDensityA(args: {
  normalized: NormalizedInput;
  outputText: string;
  requestId: string;
  provider?: string;
  model?: string;
  templateKey: string;
  isSNS: boolean;
  ctaMode: CtaMode;
  hasProductFacts: boolean;
}) {
  try {
    const fn = (DensityA as any)?.evaluateDensityA;
    if (typeof fn !== "function") return;

    // ✅ C-2整合：densityA観測も必須セットのみ（ただし selling_points は最大1件だけで 3/4 を固定）
    const densNorm = normalizedForDensityA(args.normalized);

    const r = fn(densNorm, args.outputText);

    const densityA = typeof r?.densityA === "number" ? r.densityA : null;
    const inputCount = Array.isArray(r?.inputSet) ? r.inputSet.length : null;
    const usedCount = Array.isArray(r?.usedSet) ? r.usedSet.length : null;

    const masked =
      Array.isArray(r?.unusedTop3ForLogMasked) && r.unusedTop3ForLogMasked.length > 0
        ? r.unusedTop3ForLogMasked
        : [];
    const unusedTop3ForLogMasked20 = masked.map((x: any) => limit20(x)).slice(0, 3);

    const densityLog = {
      phase: "densityA_observe" as const,
      level: "INFO",
      route: "/api/writer",
      message: "densityA observed (log-only)",
      provider: args.provider,
      model: args.model,
      requestId: args.requestId,
      templateKey: args.templateKey,
      isSNS: args.isSNS,
      ctaMode: args.ctaMode,
      hasProductFacts: args.hasProductFacts,
      densityA,
      inputCount,
      usedCount,
      unusedTop3ForLogMasked: unusedTop3ForLogMasked20,
    };

    logEvent("ok", densityLog);
    forceConsoleEvent("ok", densityLog);
  } catch {
    // best-effort
  }
}

/* =========================
   Handoff
========================= */

export type WriterPipelineArgs = {
  rawPrompt: string;
  normalized: NormalizedInput;
  provider: string | undefined;
  model: string | undefined;
  temperature: number;
  systemOverride: string;
  apiKey: string;
  t0: number;
  requestId: string;
  elapsed: () => number;
  productId?: string | null;
  productContext?: ProductContext | null;
};

export async function runWriterPipeline(args: WriterPipelineArgs): Promise<Response> {
  const result = await runWriterPipelineCore(args);

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          reason: result.reason,
          message: result.message,
          ...(result.code ? { code: result.code } : {}),
        },
        meta: result.meta ?? undefined,
      },
      { status: 502 },
    );
  }

  let finalText = applyPostprocess(result.openai.content, result.ctx.input.normalized as any);

  {
    const repaired = repairBulletsToMax3(finalText);
    finalText = repaired.text;
  }

  // ✅ 生成側（辞書なし）：audience 原文を返却直前で1回だけ保証する
  {
    const enforced = enforceAudienceExactOnce(finalText, result.ctx.input.normalized.audience);
    finalText = enforced.text;
  }

  return NextResponse.json(
    {
      ok: true,
      data: {
        text: finalText,
        meta: {
          style: (result.ctx.input.normalized.style ?? "").toString(),
          tone: (result.ctx.input.normalized.tone ?? "").toString(),
          locale: "ja-JP",
          toneKey: result.ctx.input.toneKey,
          template: result.ctx.input.templateKey || null,
          ctaMode: result.ctx.flags.cta.mode,
        },
      },
      output: finalText,
    },
    { status: 200 },
  );
}

export async function runWriterPipelineCore(args: WriterPipelineArgs): Promise<WriterPipelineResult> {
  const {
    rawPrompt,
    normalized,
    provider,
    model,
    temperature,
    systemOverride,
    apiKey,
    t0,
    requestId,
    productId,
    productContext,
  } = args;

  const templateKey = resolveTemplateKey(normalized);
  const isSNS = isSnsLikeTemplate(templateKey);
  const toneKey = resolveTonePresetKey(normalized.tone, normalized.style);
  const ctaMode = resolveCtaMode(normalized);

  logProductContextStatus({
    productId: productId ?? null,
    context: productContext ?? null,
    meta: { source: "writer.pipeline", requestId, path: "/api/writer" },
  });

  const precisionPayload = buildPrecisionProductPayload({
    productId: productId ?? null,
    context: productContext ?? null,
  });

  const productFacts = buildProductFactsDto({
    productId: productId ?? null,
    enabled: true,
    context: productContext ?? null,
    error: null,
  });

  const productFactsBlock = buildProductFactsBlock(precisionPayload, productFacts);

  const baseSystemRaw = buildSystemPrompt({
    overrides: systemOverride,
    toneKey,
  });

  const safetyConstraintsBlock = [
    "制約:",
    "- 入力に無い具体値（数値・期間・等級・型番・受賞・ランキング・保証条件など）は断定しない。",
    "- 不足情報は“想像で補わない”。分からない要素は触れない。",
    "- 過剰なFAQ、強引な断定、煽り見出し（今すぐ/必ず/絶対等）は避ける。",
    "- 本文のみを出力する。追加ブロック（CTA/FAQなど）は書かない。",
  ].join("\n");

  const systemParts: string[] = [baseSystemRaw];
  if (productFactsBlock) systemParts.push(productFactsBlock);
  systemParts.push(safetyConstraintsBlock);
  const system = systemParts.join("\n\n");

  const baseUserMessage = makeUserMessage(normalized);
  const user = `${baseUserMessage}\n${buildOutputRulesSuffix(normalized)}`;

  const ctx: WriterPipelineCtx = {
    request: { requestId, route: "/api/writer", provider, model, temperature, t0 },
    input: {
      rawPrompt,
      normalized,
      productId: productId ?? null,
      productContext: productContext ?? null,
      templateKey,
      isSNS,
      toneKey,
    },
    flags: { cta: { mode: ctaMode } },
    contracts: { ctaBlock: buildCtaBlockContract() },
    prompts: {
      system,
      user,
      debug: {
        baseSystemLength: system.length,
        userLength: user.length,
        systemHash8: sha256Hex(system).slice(0, 8),
        userHash8: sha256Hex(user).slice(0, 8),
        hasProductFacts: Boolean(productFactsBlock),
      },
    },
    product: {
      precisionPayload,
      productFacts,
      productFactsBlock: productFactsBlock ?? null,
    },
  };

  const decideLog = {
    phase: "pipeline_decide" as const,
    level: "DEBUG",
    route: "/api/writer",
    message: "pipeline decided prompts and flags",
    provider,
    model,
    requestId,
    toneKey,
    templateKey,
    isSNS,
    ctaMode,
    systemHash8: ctx.prompts.debug?.systemHash8 ?? null,
    userHash8: ctx.prompts.debug?.userHash8 ?? null,
    hasProductFacts: ctx.prompts.debug?.hasProductFacts ?? false,
  };
  logEvent("ok", decideLog);
  forceConsoleEvent("ok", decideLog);
  await emitWriterEvent("ok", decideLog);

  const openaiPayload = buildOpenAIRequestPayload({
    model,
    temperature,
    system: ctx.prompts.system,
    userMessage: ctx.prompts.user,
  });

  const callOnce = async (idx: number) => {
    const r = await callOpenAI({ apiKey, payload: openaiPayload });
    if (!r.ok) {
      return {
        ok: false as const,
        idx,
        status: r.status,
        statusText: r.statusText,
        apiMs: r.apiMs,
        errorTextPreview: r.errorText?.slice(0, 500) ?? "",
      };
    }
    return {
      ok: true as const,
      idx,
      content: (r.content ?? "").toString(),
      status: r.status,
      statusText: r.statusText,
      apiMs: r.apiMs,
    };
  };

  const results = await Promise.all([callOnce(1), callOnce(2), callOnce(3)]);

  const oks = results.filter((x): x is Extract<(typeof results)[number], { ok: true }> => x.ok);
  const ngs = results.filter((x): x is Extract<(typeof results)[number], { ok: false }> => !x.ok);

  if (oks.length === 0) {
    const first = ngs[0];
    const message = `openai api error: ${first?.status ?? 0} ${first?.statusText ?? "unknown"}`;
    const errLog = {
      phase: "pipeline_handoff" as const,
      level: "ERROR",
      route: "/api/writer",
      message,
      provider,
      model,
      requestId,
      status: first?.status ?? 0,
      statusText: first?.statusText ?? "unknown",
      apiMs: first?.apiMs ?? 0,
      errorTextPreview: first?.errorTextPreview ?? "",
      attempts: results.map((x) => ({
        idx: x.idx,
        ok: x.ok,
        status: (x as any).status ?? null,
        apiMs: (x as any).apiMs ?? null,
      })),
    };
    logEvent("error", errLog);
    forceConsoleEvent("error", errLog);
    await emitWriterEvent("error", errLog);
    return { ok: false, reason: "openai_api_error", message, meta: { requestId } };
  }

  // ===== Choose best (L3 → densityA tie-break) =====
  let attemptedExtraCount = 0;
  let extraAttempt: { idx: number; ok: boolean; status: number; apiMs: number } | null = null;

  let { best, scored } = chooseBestCandidate(
    oks.map((x) => ({
      idx: x.idx,
      content: x.content,
      apiMs: x.apiMs,
      status: x.status,
      statusText: x.statusText,
    })),
    normalized,
  );

  const densityAThreshold = resolveDensityAThreshold(best.inputCount);

  const rescueTriggeredByAbstractHead = scored.length >= 3 && scored.every((s) => hasAbstractHeadReason(s.reasons));

  // ✅ 最小修正：densityAが「評価不能（inputCount=0/null）」のときは lowDensity救済を発火させない
  const canUseLowDensityRescue = best.inputCount === 3 || best.inputCount === 4;
  const rescueTriggeredByLowDensity =
    canUseLowDensityRescue && typeof best.densityA === "number" && best.densityA < densityAThreshold;

  if (rescueTriggeredByAbstractHead || rescueTriggeredByLowDensity) {
    attemptedExtraCount = 1;
    const extra = await callOnce(4);

    if (extra.ok) {
      extraAttempt = { idx: extra.idx, ok: true, status: extra.status, apiMs: extra.apiMs };

      const reselect = chooseBestCandidate(
        [
          ...oks.map((x) => ({
            idx: x.idx,
            content: x.content,
            apiMs: x.apiMs,
            status: x.status,
            statusText: x.statusText,
          })),
          {
            idx: extra.idx,
            content: extra.content,
            apiMs: extra.apiMs,
            status: extra.status,
            statusText: extra.statusText,
          },
        ],
        normalized,
      );

      best = reselect.best;
      scored = reselect.scored;
    } else {
      extraAttempt = { idx: extra.idx, ok: false, status: extra.status, apiMs: extra.apiMs };
    }
  }

  const selectLog = {
    phase: "pipeline_select" as const,
    level: "DEBUG",
    route: "/api/writer",
    message: "selected best candidate by L3 scoring (+ densityA tie-breaker + threshold rescue)",
    provider,
    model,
    requestId,
    selectedIdx: best.idx,
    selectedScore: best.score,
    selectedDidRepair: Boolean(best.didRepair),
    selectedReasons: best.reasons.slice(0, 12),
    selectedFacts: best.facts,

    selectedDensityA: best.densityA,
    selectedInputCount: best.inputCount,
    selectedUsedCount: best.usedCount,
    densityAThreshold,
    rescueTriggeredByLowDensity,
    rescueTriggeredByAbstractHead,

    attemptedExtraCount,
    extraAttempt,

    candidateScores: scored.map((s) => ({
      idx: s.idx,
      score: s.score,
      didRepair: Boolean(s.didRepair),
      reasons: s.reasons.slice(0, 8),
      facts: s.facts,
      densityA: s.densityA,
      inputCount: s.inputCount,
      usedCount: s.usedCount,
      contentLen: s.contentLen,
      contentHash8: s.contentHash8,
      apiMs: s.apiMs,
      status: s.status,
    })),
    failedAttempts: ngs.map((n) => ({
      idx: n.idx,
      status: n.status,
      statusText: n.statusText,
      apiMs: n.apiMs,
    })),
  };
  logEvent("ok", selectLog);
  forceConsoleEvent("ok", selectLog);
  await emitWriterEvent("ok", selectLog);

  const chosenContent = (best.content ?? "").toString().trim();
  if (!chosenContent) {
    const errLog = {
      phase: "pipeline_handoff" as const,
      level: "ERROR",
      route: "/api/writer",
      message: "empty content",
      provider,
      model,
      requestId,
      status: best.status,
      statusText: best.statusText,
      apiMs: best.apiMs,
    };
    logEvent("error", errLog);
    forceConsoleEvent("error", errLog);
    await emitWriterEvent("error", errLog);
    return { ok: false, reason: "openai_empty_content", message: "empty content", meta: { requestId } };
  }

  observeDensityA({
    normalized,
    outputText: chosenContent,
    requestId,
    provider,
    model,
    templateKey,
    isSNS,
    ctaMode,
    hasProductFacts: Boolean(productFactsBlock),
  });

  return {
    ok: true,
    ctx,
    openai: { content: chosenContent, apiMs: best.apiMs, status: best.status, statusText: best.statusText },
  };
}
