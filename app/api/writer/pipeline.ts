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
 * - ✅ 今回フェーズ（Writer単体80点）では Product Facts を使用しない（system注入を無効化）
 * - CTAのSSOT: ctx.flags.cta.mode ("on" | "off")
 * - CTAブロック仕様SSOT: ctx.contracts.ctaBlock（仕様のみ。生成は他責務）
 * - ✅ 実運用上必要なので applyPostprocess() は “返却直前” にのみ適用する（data.text / output を同一に固定）
 * - ✅ さらに “最終返却の直前” に repair を必ず通し、UI/モデル差に依存しない改行を担保する
 *
 * ✅ 方式C（安定化）:
 * - repair は「整形（箇条書き/改行）」だけ（文章内容を削除・改変しない）
 * - 日本語の破綻は L3採点で重めに減点し、候補選択で落とす
 * - 返却直前の置換は “超安全な限定置換” だけ（必要最小）
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
 *
 * ✅ 方式C：文法破綻を避けるため、head2 が「場所起点」のときだけ particle を「が」にする
 */
function enforceAudienceExactOnce(text: string, audienceRaw: string): { text: string; didEnforce: boolean } {
  const audience = (audienceRaw ?? "").toString().trim();
  if (!audience) return { text: (text ?? "").toString(), didEnforce: false };

  const t = (text ?? "").toString().replace(/\r\n/g, "\n").trim();
  if (!t) return { text: t, didEnforce: false };

  // 既に含まれているならOK（過剰修正を避ける）
  if (t.includes(audience)) return { text: t, didEnforce: false };

  const { head, body } = splitHeadAndBody(t);
  if (!head) return { text: t, didEnforce: false };

  const parts = head
    .split("。")
    .map((s) => s.trim())
    .filter(Boolean);

  const chooseParticle = (head2: string): "が" | "の" => {
    const h2 = (head2 ?? "").toString().trim();
    if (!h2) return "の";

    // head2 が “場所/状況” から始まるときは「の」を使うと重複破綻しやすい（例：オフィスワーカーのオフィスで）
    // → 主語として「が」に寄せる
    const LOCATION_START_RE =
      /^(?:朝|昼|夜|通勤|通学|移動中|在宅|自宅|オフィス|職場|デスク|会議|カフェ|店頭|レジ|キッチン|洗面所|寝室|リビング|外出先|週末|平日|雨の日|旅行|出張|作業中)/;
    if (LOCATION_START_RE.test(h2)) return "が";

    // ✅ 追加：head2 が “動作/行為” 起点のときも「の」は不自然になりやすい
    // 例：オフィスワーカーの作業をしながら → オフィスワーカーが作業をしながら
    const ACTION_START_RE =
      /^(?:(?:デスクワーク|資料作成|入力作業|事務作業|作業|仕事|会議|打ち合わせ|商談|勉強|学習|授業|練習|移動|通勤|通学|在宅勤務|家事)(?:中に|の合間に|をしながら|をしつつ|をしているとき|をする時|をするとき|中)|(?:作業|仕事|会議|勉強|移動|通勤|家事)(?:を|で))/;
    if (ACTION_START_RE.test(h2)) return "が";

    // 2文目が「〜で」始まりなどのケースも主語が安定
    const START_WITH_DE_RE = /^(?:[^\s]{1,8}で)/;
    if (START_WITH_DE_RE.test(h2)) return "が";

    return "の";
  };

  if (parts.length >= 2) {
    const head1 = `${parts[0]}。`;
    const head2 = parts[1] ?? "";

    const particle = chooseParticle(head2);
    const injected2 = head2 ? `${audience}${particle}${head2}` : `${audience}が作業中に使います`;

    const rebuiltHead = `${head1}\n${injected2}。`.trim();
    const rebuilt = body ? `${rebuiltHead}\n\n${body}`.trim() : rebuiltHead;
    return { text: rebuilt, didEnforce: true };
  }

  // 1文しか無い場合（例外）: 末尾に一言だけ足す
  const rebuiltHead = `${head}\n${audience}が作業中に使います。`.trim();
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

function buildOutputRulesLines(ctx: OutputRulesSuffixCtx, useForceLines: string[], normalized: NormalizedInput): string[] {
  // ✅ 合意③：A2固定は「機能入力があるときだけ」強制（捏造圧を除去）
  const shouldForceA2 = hasFeatureInput(normalized);

  return [
    "",
    "---",
    "出力ルール（厳守）:",
    "- 見出し（## 等）を出さない。",
    "- ヘッド2文（用途+主ベネフィット / 使用シーン）→ 箇条書き3点の順に出力する。",
    "- 抽象まとめ・同義反復で水増ししない。",
    "- 短文化は努力目標ではなく制約（余計な説明を足さない）。",
    "- 固有情報は入力にあるもののみ（推測/捏造禁止）。",
    "",
    "80点（固定）を満たすための制約:",
    "- 文章内に「数値/単位/仕様語（例: 12席, 450ml, LED, USB, Type-C など）」が入力にある場合は、最低1つ必ず入れる（入力に無ければ追加しない）。",
    "",
    "ヘッドの制約:",
    `- 1文目は product_name を必ず含める${ctx.pn ? `（"${ctx.pn}"を省略しない）` : ""}。`,
    "- 1文目は「用途+主ベネフィット」を事実ベースで短く書く（説明禁止）。",
    "- 2文目は「使用シーン」のみを書く（説明禁止）。",
    "- 2文目は名詞で終わらせず、動作を1つ入れる（例:『デスクで資料を書きながら使います。』）。",
    "- ヘッドで「重要」「サポート」「〜でしょう」などの水増し語を入れない。",
    "- ヘッドでは“評価語（快適/使いやすい/目に優しい等）”を書かない。",
    "",
    "ボディ（箇条書き）:",
    "- 箇条書きは必ず3点。必ず改行し、1行1点にする（1行に複数要素を詰めない）。",
    "",
    ...(shouldForceA2
      ? [
          "✅ A2固定（箇条書き2行の型を条件付き強制）:",
          "- 1点目（A2-1）：必ずこの型で書く → 『〈機能〉で、〈困りごと〉をしにくくします。』",
          "- 2点目（A2-2）：必ずこの型で書く → 『〈仕様〉で、〈手間/回数〉を減らします。』",
          "- 3点目（自由枠）：価値/汎用性（使う場面が増える・手間が減る等）を短く1行で書く。",
          "- 1点目と2点目は「機能→効果」になっていること（“機能列挙だけ”は禁止）。",
          "",
        ]
      : []),
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
  const rules = buildOutputRulesLines(ctx, useForceLines, normalized).join("\n");

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
 * - ✅ 途中改行で「る。」「ます。」等が独立行になった場合は直前の箇条書きに吸収（UI崩れ防止）
 * - ✅ さらに「。」だけが独立行になった場合も、直前の箇条書きに吸収
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

  // ✅ 「途中改行で続きだけが1行になる」ケースを最小で吸収
  const canJoinContinuation = (prevBulletLine: string, currLine: string): boolean => {
    const prev = (prevBulletLine ?? "").toString().trim();
    const curr = (currLine ?? "").toString().trim();
    if (!prev || !curr) return false;

    // 既に文末なら join しない
    if (/[。！？!?]$/.test(prev)) return false;

    // 長い行は誤結合リスクがあるので join しない
    if (curr.length > 8) return false;

    // 箇条書きや見出しっぽい開始は除外
    if (/^[・\-]\s*/.test(curr)) return false;
    if (/^[0-9A-Za-z「『（(【]/.test(curr)) return false;

    // ✅ 句点/感嘆符/疑問符「だけ」の行は join して良い
    if (/^[。！？!?]+$/.test(curr)) return true;

    // ひらがなだけ（+句点/感嘆符）等の「続き行」っぽいときだけ join
    if (/^[ぁ-ん]+[。！？!?]?$/.test(curr)) return true;

    return false;
  };

  for (const ln of lines) {
    const isBullet = /^[・\-]\s*/.test(ln);

    if (!isBullet) {
      // 直前の箇条書きに「続き行」を吸収できるなら吸収する
      if (repairedBullets.length > 0) {
        const lastIdx = repairedBullets.length - 1;
        const prevLine = repairedBullets[lastIdx] ?? "";
        if (canJoinContinuation(prevLine, ln)) {
          didRepair = true;
          repairedBullets[lastIdx] = prevLine.replace(/\s+$/g, "") + ln;
          continue;
        }
      }

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

/**
 * 80点（固定）の“検知”用ヘルパー（辞書に寄せず、パターン中心）
 */
function hasAnySpecOrNumber(text: string): boolean {
  const t = (text ?? "").toString();
  if (!t) return false;

  // 数値/単位（仕様シグナル）
  const UNIT_OR_NUMBER_RE =
    /[0-9０-９]+|%|％|mm|cm|m|g|kg|mg|ml|mL|l|L|W|w|V|v|Hz|kHz|lm|ルーメン|インチ|時間|分|秒|年|回|段階/;

  // 仕様語（最低限：増やす運用にしない）
  const SPEC_MARKERS_RE = /(LED|USB|Type-?C|Bluetooth|Wi-?Fi|可動|調整|角度|高さ|明るさ)/;

  return UNIT_OR_NUMBER_RE.test(t) || SPEC_MARKERS_RE.test(t);
}

function head2HasAction(head2: string): boolean {
  const h = (head2 ?? "").toString().trim();
  if (!h) return false;

  // ✅ STEP3（情景1カット安定化のみ）:
  // - HEAD2_NO_ACTION の誤判定（false negative）を減らすため、
  //   「活用形を吸う最小拡張」を追加する
  // - 他レイヤー/他減点には触らない
  //
  // 方針:
  // 1) 明示的な動作語（既存）を残す
  // 2) “～たい/～ます/～て/～で/～る/～た/～ない/～れる/～られる/～しやすい/～しにくい/～しづらい/～ながら/～つつ”
  //    のような活用形・接続を拾って「動作あり」とみなす（最小拡張）
  const ACTION_RE =
    /(?:して|しながら|するとき|しつつ|している|してる|しない|します|しました|できる|できて|使う|使って|置く|置いて|持つ|持って|運ぶ|運んで|書く|書いて|読む|読んで|飲む|飲んで|楽しむ|楽しんで|作業|会議|移動|撮影)/;

  // 活用形・接続（最小拡張）
  const ACTION_TAIL_RE =
    /(?:ます|ました|ません|たい|て|で|る|た|ない|れる|られる|せる|しやす(?:い|く)|しにく(?:い|く)|しづら(?:い|く)|ながら|つつ)/;

  // 既存動作語があれば即OK
  if (ACTION_RE.test(h)) return true;

  // 文章中に活用形・接続があれば「動作あり」とみなす（誤判定を避ける）
  return ACTION_TAIL_RE.test(h);
}

function head2LooksLikeSceneOnly(head2: string): boolean {
  const h = (head2 ?? "").toString().trim();
  if (!h) return false;

  // “説明”寄りの接続（最小でチェック）
  const EXPLAIN_RE = /(?:ため|ので|から|により|ことで|つまり|結果|そのため)/;
  const CAN_DO_RE = /(?:できます|することができます)/;
  const ABSTRACT_RE = /(?:役立つ|活用|実現します|最適|便利|使いやすい|人気)/;

  if (EXPLAIN_RE.test(h)) return false;
  if (CAN_DO_RE.test(h)) return false;
  if (ABSTRACT_RE.test(h)) return false;

  return true;
}

function countBulletsWithFuncEffect(bullets: string[]): number {
  const xs = (bullets ?? []).slice(0, 3);

  // “機能→効果”っぽい接続
  const LINK_RE = /(?:で|により|から|によって)/;

  // 効果（困りごと解消/状態改善）
  // ✅ 最小拡張:
  // - 「しやすい/しやすく」「しにくい/しにくく」を吸う（結露しにくく 等）
  // - 「保つ/保ちます/保てます」「減らす/減らします」を吸う（活用形の穴埋め）
  const EFFECT_RE =
    /(?:しやす(?:い|く)|しにく(?:い|く)|防ぐ|防止|抑える|減ら(?:す|し(?:ます|ました|ません)?)|軽減|回避|守る|保(?:つ|ち(?:ます|ました|ません)?|て(?:る|ます)?)|維持|短縮|効率|濡れにく(?:い|く)|疲れにく(?:い|く)|こぼれにく(?:い|く)|割れにく(?:い|く)|崩れにく(?:い|く))/;

  let ok = 0;
  for (const b of xs) {
    const line = (b ?? "").toString();
    if (!line) continue;

    // 先頭の記号は外す
    const stripped = line.replace(/^[・\-]\s*/, "").trim();
    if (!stripped) continue;

    if (LINK_RE.test(stripped) && EFFECT_RE.test(stripped)) {
      ok += 1;
      continue;
    }

    // もう一段だけ許容（「〜しにくい」単体でも効果が明確ならOK）
    if (EFFECT_RE.test(stripped)) {
      ok += 1;
      continue;
    }
  }

  return ok;
}

/**
 * ✅ 方式C：日本語破綻ペナルティ（少数パターン）
 * - 禁句リスト依存ではなく「破綻パターン」を見る
 * - 誤爆しにくいものだけを最小セットで重めに減点
 */
type JaBreakHit = { key: string; penalty: number };

function detectJapaneseBreakage(text: string): JaBreakHit[] {
  const t = (text ?? "").toString().replace(/\r\n/g, "\n");
  if (!t) return [];

  const hits: JaBreakHit[] = [];
  const push = (key: string, penalty: number) => hits.push({ key, penalty });

  // 1) 助詞破綻（観測）：◯◯をために / ◯◯をための
  if (/(?:を|に)\s*ため(?:に|の)/.test(t)) push("JA_BREAK_PARTICLE_TAME", 18);

  // 2) 明らかな重複構文：XのXで（最小）
  if (/([ぁ-んァ-ン一-龥]{2,})の\1で/.test(t)) push("JA_BREAK_X_NO_X_DE", 14);

  // 3) 近接同一語の連発（場所語に限定して誤爆低減）
  //    例：オフィス…オフィス（短距離）
  if (/(オフィス|職場|デスク|会議|カフェ).{0,8}\1/.test(t)) push("JA_BREAK_NEAR_DUP_LOCATION", 10);

  // 4) 典型破綻：オフィスやカフェのオフィスで（観測系を最小で拾う）
  //    “や/と” + “の” + 同語再登場
  if (/(オフィス|職場|デスク|会議|カフェ)[やと](オフィス|職場|デスク|会議|カフェ)の\1で/.test(t)) {
    push("JA_BREAK_YA_TO_NO_REPEAT", 16);
  }

  return hits;
}

/**
 * ✅ 80点（自然さ）: 根拠のない強い断定の検知（最小・誤爆を避ける）
 * - 強断言（誤爆が少ない）は本文内にあれば即NG
 * - 「必ず/確実」は誤爆しやすいので “文頭に出たときだけ” NG
 */
function hasUnsupportedStrongAssertion(text: string): boolean {
  const t = (text ?? "").toString();
  if (!t) return false;

  // 誤爆が少ない強断言（見つけたら即NG）
  const HARD_ASSERT_RE = /(100%|１００％|No\.?1|Ｎｏ\.?１|no\.?1|業界初|永久|絶対|完璧)/;
  if (HARD_ASSERT_RE.test(t)) return true;

  // 誤爆しやすい語は “文頭” に限定（安全側）
  const sentences = t
    .replace(/\r\n/g, "\n")
    .split("。")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const s of sentences) {
    if (/^(必ず|確実)\b/.test(s)) return true;
    // 「必ず」「確実」が行頭（改行後）に来るケースも拾う
    if (/^(?:[・\-]\s*)?(必ず|確実)\b/.test(s)) return true;
  }

  return false;
}

/**
 * ✅ 80点（自然さ）: 語尾の連発検知（最小）
 * - 「です/ます/します」等の終端が2回以上連続したらNG
 */
function hasRepeatedSentenceEnding(text: string): boolean {
  const t = (text ?? "").toString().replace(/\r\n/g, "\n").trim();
  if (!t) return false;

  // ✅ A案：語尾連発は「ヘッド（2文）」だけで判定する（箇条書きは除外）
  const { head } = splitHeadAndBody(t);
  const h = (head ?? "").toString().replace(/\r\n/g, "\n").trim();
  if (!h) return false;

  const sentences = h
    .split("。")
    .map((s) => s.trim())
    .filter(Boolean);

  const pickEnding = (s: string): string => {
    const x = (s ?? "").toString().trim();
    if (!x) return "";

    // よくある終端を優先して拾う
    const m =
      x.match(/(です|ます|します|しました|でした|でしたら|でしょう|できます)$/) ??
      x.match(/(ない|ないです|ません|ませんでした)$/);
    if (m && m[1]) return m[1];

    // 最後の4文字（汎用フォールバック）
    return x.slice(Math.max(0, x.length - 4));
  };

  let prev = "";
  let streak = 1;

  for (const s of sentences) {
    // 短すぎる文はノイズなので飛ばす
    if (s.length <= 3) continue;

    const end = pickEnding(s);
    if (!end) continue;

    if (prev && end === prev) {
      streak += 1;
      if (streak >= 2) return true; // 2連続でNG（最小）
    } else {
      prev = end;
      streak = 1;
    }
  }

  return false;
}

/**
 * ✅ L3: 具体語比率型（Bodyのみ）
 * - 抽象語の禁止ではなく「具体ゼロを軽く不利」「具体が複数なら軽く有利」にする
 * - 既存L3構造/既存減点ロジックは変更しない（末尾で微調整のみ）
 *
 * 具体シグナル（合意済み）:
 * - 数字: /\d/
 * - 単位: ml | cm | 分 | 時 | 席
 * - 時間語: 朝 | 昼 | 休憩 | 会議 | 通勤 | 退勤
 * - 場所語: デスク | 机 | オフィス | カフェ | 自宅 | バッグ
 */
function countConcreteSignalsInBody(body: string): number {
  const b = (body ?? "").toString().replace(/\r\n/g, "\n");
  if (!b) return 0;

  let n = 0;

  // 1) 数字系（半角のみ：合意通り /\d/）
  if (/\d/.test(b)) n += 1;

  // 2) 単位系
  if (/(?:ml|cm|分|時|席)/.test(b)) n += 1;

  // 3) 時間語
  if (/(?:朝|昼|休憩|会議|通勤|退勤)/.test(b)) n += 1;

  // 4) 場所語
  if (/(?:デスク|机|オフィス|カフェ|自宅|バッグ)/.test(b)) n += 1;

  return n;
}

/* =========================
   L3 vNext: 入力密度に応じた評価モード
========================= */

function buildInputTextForScoring(normalized: NormalizedInput): string {
  const join = (xs: unknown): string => uniqueNonEmptyStrings(xs).join("\n");
  const parts = [
    (normalized.product_name ?? "").toString(),
    (normalized.category ?? "").toString(),
    (normalized.goal ?? "").toString(),
    (normalized.audience ?? "").toString(),
    join(normalized.selling_points),
    join(normalized.evidence),
    join(normalized.constraints),
    join(normalized.keywords),
  ];
  return parts.filter(Boolean).join("\n").trim();
}

// ✅ 合意①：func入力判定は「非空」ではなく「根拠シグナルあり（facts）」で判定する
function hasFeatureInput(normalized: NormalizedInput): boolean {
  const spRaw = Array.isArray(normalized.selling_points) ? normalized.selling_points : [];
  const evRaw = Array.isArray(normalized.evidence) ? normalized.evidence : [];

  const sp = classifySellingPoints(uniqueNonEmptyStrings(spRaw)).facts;
  const ev = classifySellingPoints(uniqueNonEmptyStrings(evRaw)).facts;

  return sp.length > 0 || ev.length > 0;
}

function hasSpecInput(normalized: NormalizedInput): boolean {
  // 「仕様入力あり」は、入力側テキストに “数値/単位/仕様語” が含まれるかで判定（文字数は使わない）
  const inputText = buildInputTextForScoring(normalized);
  return hasAnySpecOrNumber(inputText);
}

function extractSpecTokens(text: string): string[] {
  const t = (text ?? "").toString().replace(/\r\n/g, "\n");
  if (!t) return [];

  const tokens: string[] = [];
  const seen = new Set<string>();

  // 数値 + 単位（できるだけ誤爆を避ける）
  const NUM_UNIT_RE =
    /(?:[0-9０-９]{1,6})(?:\s*(?:%|％|mm|cm|m|g|kg|mg|ml|mL|l|L|W|w|V|v|Hz|kHz|lm|ルーメン|インチ|時間|分|秒|年|回|段階))?/g;

  // 仕様語（最小集合）
  const SPEC_MARKERS_RE = /(LED|USB|Type-?C|Bluetooth|Wi-?Fi|可動|調整|角度|高さ|明るさ)/g;

  const push = (s: string) => {
    const x = (s ?? "").toString().trim();
    if (!x) return;
    if (seen.has(x)) return;
    seen.add(x);
    tokens.push(x);
  };

  const ms1 = t.match(NUM_UNIT_RE) ?? [];
  for (const m of ms1) push(m);

  const ms2 = t.match(SPEC_MARKERS_RE) ?? [];
  for (const m of ms2) push(m);

  return tokens;
}

function hasSpecInflation(outputText: string, normalized: NormalizedInput): boolean {
  // 出力に “入力に無い” 数値/単位/仕様語が出たら NG（捏造圧を下げる核）
  const inputText = buildInputTextForScoring(normalized);

  const inputTokens = new Set(extractSpecTokens(inputText));
  const outTokens = extractSpecTokens(outputText);

  if (outTokens.length === 0) return false;

  for (const tok of outTokens) {
    // 出力トークンが入力にも存在すればOK
    if (inputTokens.has(tok)) continue;

    // 数字だけは誤爆があり得るので、入力に同じ “数字” があれば許容（単位違いは依然NG）
    const digitsOnly = tok.replace(/[^\d０-９]/g, "");
    if (digitsOnly && digitsOnly !== tok) {
      // 数字+単位系はそのまま比較（単位違いは捏造になりやすい）
    } else if (digitsOnly) {
      const hasSameDigitsInInput = Array.from(inputTokens).some((it) => it.replace(/[^\d０-９]/g, "") === digitsOnly);
      if (hasSameDigitsInInput) continue;
    }

    return true;
  }

  return false;
}

function isPurposeAligned(headText: string, goalRaw: string): boolean {
  const head = (headText ?? "").toString();
  const goal = (goalRaw ?? "").toString().trim();
  if (!goal) return true;

  // そのまま含まれていれば合格（最優先）
  if (head.includes(goal)) return true;

  // 雑に単語抽出（日本語は形態素が無いので「事故らない最小」）
  const stop = new Set(["ため", "向け", "したい", "した", "する", "用途", "目的", "の", "に", "を", "が", "で", "と", "や"]);
  const rawTokens = goal
    .replace(/\r\n/g, "\n")
    .split(/[\s\n、。・/／|｜]+/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const tokens = rawTokens
    .map((s) => s.replace(/[「」『』（）()【】]/g, "").trim())
    .filter((s) => s.length >= 2)
    .filter((s) => !stop.has(s));

  // 2語までで十分（過剰な一致要求はしない）
  for (const tk of tokens.slice(0, 2)) {
    if (head.includes(tk)) return true;
  }

  return false;
}

// ✅ 合意②：goalが「依頼目的（商品説明/紹介文など）」なら PURPOSE_NOT_ALIGNED を評価しない
function isGoalRequestType(goalRaw: string): boolean {
  const g = (goalRaw ?? "").toString();
  if (!g) return false;
  return /(商品説明|説明文|紹介文|商品ページ|ランディング|LP)/.test(g);
}

function shouldEvaluatePurpose(normalized: NormalizedInput): boolean {
  const goal = (normalized.goal ?? "").toString().trim();
  if (!goal) return false;
  if (isGoalRequestType(goal)) return false;
  return true;
}

function head2HasSceneCue(head2: string): boolean {
  const h = (head2 ?? "").toString().trim();
  if (!h) return false;

  // ✅ STEP3（情景1カット安定化のみ）:
  // - SCENE_CUE_MISSING の誤判定（false negative）を減らすため、
  //   「時間/状況の接続」を最小追加する（場所辞書を増やす運用はしない）
  const CUE_RE =
    /(?:朝|昼|夜|通勤|通学|移動中|在宅|自宅|オフィス|職場|デスク|会議|店頭|レジ|キッチン|洗面所|寝室|リビング|外出先|週末|平日|雨の日|旅行|出張|作業中|中に|中で|中は|最中|途中|のとき|とき|時|前に|後に|合間に|ながら|つつ)/;

  return CUE_RE.test(h);
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

  // === 入力密度ベースの評価モード ===
  const inputHasSpec = hasSpecInput(normalized);
  const inputHasFeature = hasFeatureInput(normalized);
  const isLowInput = !inputHasSpec && !inputHasFeature;

  // ✅ 自然さ（抽象まとめ語）: HEAD優先で落とす（※削除repairはしない）
  const bannedHeadWords = [
    "最適",
    "ぴったり",
    "おすすめ",
    "大活躍",
    "便利",
    "快適",
    "使いやすい",
    "人気",
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

  // ✅ 方式C：日本語破綻ペナルティ（重めに落として採用されにくくする）
  {
    const hits = detectJapaneseBreakage(t);
    if (hits.length > 0) {
      let sum = 0;
      for (const h of hits) {
        sum += h.penalty;
        if (reasons.length < MAX_REASON_ITEMS) reasons.push(h.key);
      }
      score += sum;
      if (reasons.length < MAX_REASON_ITEMS) reasons.push("HAS_JA_BREAK");
    }
  }

  // ✅ 80点（自然さ）：根拠のない強い断定の検知
  if (hasUnsupportedStrongAssertion(t)) {
    score += 8;
    if (reasons.length < MAX_REASON_ITEMS) reasons.push("UNSUPPORTED_STRONG_ASSERTION");
  }

  // ✅ 80点（自然さ）：語尾の連発検知
  if (hasRepeatedSentenceEnding(t)) {
    score += 4;
    if (reasons.length < MAX_REASON_ITEMS) reasons.push("REPEATED_SENTENCE_ENDING");
  }

  // ✅ 80点定義（自然さ）に寄せて増強（プロジェクト辞書化はしない／最小集合）
  const ABSTRACT_SUMMARY_WORDS = ["役立つ", "安心", "最適", "心配が減る", "使いやすい", "人気", "活用", "実現します", "便利"];

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

    // ✅ 情景（評価側）：2文目は使用シーンのみ + 動作1つ
    if (!head2LooksLikeSceneOnly(head2)) {
      score += 5;
      reasons.push("HEAD2_NOT_SCENE_ONLY");
    }
    if (!head2HasAction(head2)) {
      score += 6;
      reasons.push("HEAD2_NO_ACTION");
    }

    // ✅ 情景具体（評価側）：シーン手がかりが無い場合は減点（低入力時は重め）
    if (!head2HasSceneCue(head2)) {
      score += isLowInput ? 7 : 3;
      reasons.push("SCENE_CUE_MISSING");
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

  // ✅ 用途整合（評価側）：goal があるなら、ヘッドに反映されているか
  // ✅ 合意②：goal が「依頼目的」なら評価しない
  if (shouldEvaluatePurpose(normalized)) {
    const goal = (normalized.goal ?? "").toString().trim();
    if (goal) {
      if (!isPurposeAligned(head, goal)) {
        score += 6;
        reasons.push("PURPOSE_NOT_ALIGNED");
      }
    }
  }

  // ✅ 水増し無し（評価側）：入力に無い数値/単位/仕様語を出したら減点（捏造圧を下げる）
  if (hasSpecInflation(t, normalized)) {
    score += 12;
    reasons.push("SPEC_INFLATION");
  }

  // ✅ 80点（具体性）：数値 or 仕様が最低1つ
  // - 仕様入力が無い → NO_SPEC を減点しない（捏造圧を消す）
  if (inputHasSpec) {
    if (!hasAnySpecOrNumber(t)) {
      score += 10;
      reasons.push("NO_SPEC_OR_NUMBER");
    }
  } else {
    if (!hasAnySpecOrNumber(t)) {
      if (reasons.length < MAX_REASON_ITEMS) reasons.push("NO_SPEC_OR_NUMBER_SKIPPED_NO_INPUT");
    }
  }

  // ✅ 80点（具体性）：箇条書き3行のうち2行以上が「機能→効果」
  // - 機能入力が無い → 強制（減点）しない
  if (bullets.length > 0) {
    const okCount = countBulletsWithFuncEffect(bullets);

    // ✅ 入力依存（B思想）
    // - 入力に「機能/仕様の根拠」があるときだけ減点する
    // - 無いときは減点せず、観測ログのみ残す（捏造圧をかけない）
    if (inputHasFeature) {
      if (okCount < 2) {
        score += 6 + (2 - okCount); // 少しだけ緩和（8→6）
        if (reasons.length < MAX_REASON_ITEMS) {
          reasons.push(`BULLET_FUNC_EFFECT_TOO_FEW_${okCount}`);
        }
      }
    } else {
      if (okCount < 2) {
        if (reasons.length < MAX_REASON_ITEMS) {
          reasons.push(`BULLET_FUNC_EFFECT_SKIPPED_NO_INPUT_${okCount}`);
        }
      }
    }
  }

  const hasFaqLike = /FAQ|よくある質問|Q[:：]/.test(t);
  const hasObjections = Array.isArray((normalized as any).objections) && (normalized as any).objections.length > 0;
  const hasCtaPref = Array.isArray((normalized as any).cta_preference) && (normalized as any).cta_preference.length > 0;
  if (hasFaqLike && !(hasObjections || hasCtaPref)) {
    score += 2;
    reasons.push("UNNEEDED_FAQ_LIKE");
  }

  // ✅ L3追加：具体語比率型（Bodyのみ / 既存減点ロジックは触らない）
  {
    const signalCount = countConcreteSignalsInBody(body);

    // - 具体シグナル 0個 → score += 4
    // - 具体シグナル 2個以上 → score -= 2
    // - 1個 → 変化なし
    if (signalCount === 0) {
      score += 4;
      if (reasons.length < MAX_REASON_ITEMS) reasons.push("BODY_CONCRETE_SIGNALS_0");
    } else if (signalCount >= 2) {
      score -= 2;
      if (reasons.length < MAX_REASON_ITEMS) reasons.push("BODY_CONCRETE_SIGNALS_2PLUS");
    }
  }

  // ✅ 失格→減点（止まらない最優先）
  // - 失格理由が1つでもあれば重めに減点（ただし候補除外はしない）
  {
    const hitCount = countDisqualifyHits(reasons);
    if (hitCount > 0) {
      score += 20 * hitCount; // ←重さはここで調整（まずは強め）
      reasons.push(`DISQUALIFY_PENALTY_${hitCount}`);
    }
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
   Decision gates（失格判定 → 減点へ）
========================= */

// ✅ 合意A：止まらない最優先（失格→減点）
// - “失格理由” はログ観測用に残すが、候補除外には使わない
// - 代わりに L3 score にペナルティを加算する

const DISQUALIFY_REASONS = new Set<string>([
  "HEAD2_NOT_SCENE_ONLY",
  "HEAD2_EVALUATIVE_OR_ABSTRACT",
  "HEAD2_NO_ACTION",
]);

function countDisqualifyHits(reasons: string[]): number {
  const rs = Array.isArray(reasons) ? reasons : [];
  let n = 0;
  for (const r of rs) {
    if (typeof r === "string" && DISQUALIFY_REASONS.has(r)) n += 1;
  }
  return n;
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
 */
function resolveDensityAThreshold(inputCount: number | null, normalized: NormalizedInput): number {
  const audienceLen = (normalized?.audience ?? "").toString().trim().length;

  if (inputCount === 4) {
    if (audienceLen > 0 && audienceLen <= 3) return 0.75;
    return 1.0;
  }
  if (inputCount === 3) return 1.0;
  return 0.34;
}

/* =========================
   Candidate selection（失格は除外せず減点 → L3最優先 → 同点なら densityA → 短い方）
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

  // ✅ 新設：失格（案B）
  disqualified: boolean;
};

function compareCandidates(a: ScoredCandidate, b: ScoredCandidate): number {
  if (a.score !== b.score) return a.score - b.score;

  const preferencePenalty = (facts: L3ScoreDetail["facts"]) => {
    let p = 0;
    if (facts.headSentences !== 2) p += 5;
    if (!facts.hasProductNameInHead1) p += 6;
    if (facts.hasHeading) p += 3;
    if (facts.bulletLines !== 3) p += 4;
    if (facts.bulletLooksCollapsed) p += 2;
    return p;
  };

  const pa = preferencePenalty(a.facts);
  const pb = preferencePenalty(b.facts);
  if (pa !== pb) return pa - pb;

  const da = typeof a.densityA === "number" ? a.densityA : -1;
  const db = typeof b.densityA === "number" ? b.densityA : -1;
  if (da !== db) return db - da;

  return a.contentLen - b.contentLen;
}

function chooseBestCandidate(
  candidates: Candidate[],
  normalized: NormalizedInput,
): {
  best: ScoredCandidate;
  scored: ScoredCandidate[];
  bestQualifiedOrNull: ScoredCandidate | null;
  qualifiedCount: number;
} {
  // 1) bullets repair（整形のみ）
  const bulletRepaired = candidates.map((c) => {
    const r = repairBulletsToMax3(c.content);

    // ✅ 追加：候補評価の前に audience 原文を1回だけ保証
    // - これにより densityA/救済判定/unusedTop3 が “最終文” と一致する
    const enforced = enforceAudienceExactOnce(r.text, normalized.audience);

    return { ...c, content: enforced.text, didRepair: r.didRepair };
  });

  // 2) score once（文章内容のrepairはしない）
  const scored: ScoredCandidate[] = bulletRepaired.map((c) => {
    const detail = scoreByL3Rules(c.content, normalized);
    const dens = tryComputeDensityA(normalized, c.content);
    const disqualified = countDisqualifyHits(detail.reasons) > 0;

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
      disqualified,
    };
  });

  const sortedAll = [...scored].sort(compareCandidates);

  // ✅ A：止まらない最優先 → “除外” はしない（減点で勝てなくする）
  const best = sortedAll[0] as ScoredCandidate;

  return {
    best,
    scored: sortedAll,
    bestQualifiedOrNull: best,
    qualifiedCount: sortedAll.length,
  };
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

function safeFinalReplace(text: string): { text: string; didRepair: boolean; keys: string[] } {
  // ✅ 返却直前の “超安全な限定置換” のみ
  // - 置換は「意味が変わらず文法を直す」範囲に限定
  const raw = (text ?? "").toString();
  if (!raw) return { text: raw, didRepair: false, keys: [] };

  let t = raw;
  const keys: string[] = [];
  const apply = (re: RegExp, to: string, key: string) => {
    const before = t;
    t = t.replace(re, to);
    if (t !== before) keys.push(key);
  };

  // 観測：をための/をために（助詞）
  apply(/をための/g, "のための", "FINAL_REPAIR_WO_TAMENO");
  apply(/をために/g, "のために", "FINAL_REPAIR_WO_TAMENI");
  apply(/にための/g, "のための", "FINAL_REPAIR_NI_TAMENO");
  apply(/にために/g, "のために", "FINAL_REPAIR_NI_TAMENI");

  // 観測：オフィスやカフェのオフィスで（最小）
  apply(/(オフィス|職場|デスク|会議|カフェ)や(オフィス|職場|デスク|会議|カフェ)の\1で/g, "$1や$2で", "FINAL_REPAIR_YA_NO_REPEAT");
  apply(/(オフィス|職場|デスク|会議|カフェ)と(オフィス|職場|デスク|会議|カフェ)の\1で/g, "$1と$2で", "FINAL_REPAIR_TO_NO_REPEAT");

  // 句読点周りの軽微な破綻（安全）
  apply(/、\s*、/g, "、", "FINAL_REPAIR_DOUBLE_COMMA");
  apply(/。\s*。/g, "。", "FINAL_REPAIR_DOUBLE_MARU");

  return { text: t, didRepair: keys.length > 0, keys };
}

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

  // ✅ 方式C：返却直前の超安全な限定置換（文法破綻の救済）
  {
    const r = safeFinalReplace(finalText);
    finalText = r.text;
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

  // ✅ このフェーズでは Product Facts を使わない（Writer単体入力の80点安定が目的）
  const USE_PRODUCT_FACTS = false;

  const precisionPayload = buildPrecisionProductPayload({
    productId: productId ?? null,
    context: productContext ?? null,
  });

  const productFacts = buildProductFactsDto({
    productId: productId ?? null,
    enabled: USE_PRODUCT_FACTS,
    context: productContext ?? null,
    error: null,
  });

  const productFactsBlock = USE_PRODUCT_FACTS ? buildProductFactsBlock(precisionPayload, productFacts) : null;

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

  // ===== Choose best（失格は除外せず減点 → L3 → densityA tie-break）=====
  let attemptedExtraCount = 0;
  let extraAttempt: { idx: number; ok: boolean; status: number; apiMs: number; reason: string } | null = null;

  let selection = chooseBestCandidate(
    oks.map((x) => ({
      idx: x.idx,
      content: x.content,
      apiMs: x.apiMs,
      status: x.status,
      statusText: x.statusText,
    })),
    normalized,
  );

  let best = selection.best;
  let scored = selection.scored;

  // A案：止まらない最優先 → disqualifyAll は “発火条件” に使わない（観測ログだけ残す）
  const disqualifyAllTriggered = false;

  const densityAThreshold = resolveDensityAThreshold(best.inputCount, normalized);

  // （既存）救済条件
  const rescueTriggeredByAbstractHead = scored.length >= 3 && scored.every((s) => hasAbstractHeadReason(s.reasons));

  // ✅ 最小修正：densityAが「評価不能（inputCount=0/null）」のときは lowDensity救済を発火させない
  const canUseLowDensityRescue = best.inputCount === 3 || best.inputCount === 4;
  const rescueTriggeredByLowDensity =
    canUseLowDensityRescue && typeof best.densityA === "number" && best.densityA < densityAThreshold;

  // ✅ 合意②：全滅なら再生成1回（案A）
  // ✅ 既存救済も含め「追加生成は全体で最大1回」に統一する
  const shouldAttemptExtraOnce =
    attemptedExtraCount === 0 &&
    (rescueTriggeredByAbstractHead || rescueTriggeredByLowDensity);

  if (shouldAttemptExtraOnce) {
    attemptedExtraCount = 1;

    const reason = disqualifyAllTriggered
      ? "DISQUALIFY_ALL"
      : rescueTriggeredByLowDensity
        ? "LOW_DENSITY"
        : rescueTriggeredByAbstractHead
          ? "ABSTRACT_HEAD_ALL"
          : "UNKNOWN";

    const extra = await callOnce(4);

    if (extra.ok) {
      extraAttempt = { idx: extra.idx, ok: true, status: extra.status, apiMs: extra.apiMs, reason };

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

      selection = reselect;
      best = reselect.best;
      scored = reselect.scored;
    } else {
      extraAttempt = { idx: extra.idx, ok: false, status: extra.status, apiMs: extra.apiMs, reason };
    }
  }

  const selectLog = {
    phase: "pipeline_select" as const,
    level: "DEBUG",
    route: "/api/writer",
    message: "selected best candidate by L3 scoring (+ densityA tie-breaker + threshold rescue + disqualify gate)",
    provider,
    model,
    requestId,
    selectedIdx: best.idx,
    selectedScore: best.score,
    selectedDidRepair: Boolean(best.didRepair),
    selectedDisqualified: Boolean(best.disqualified),
    selectedReasons: best.reasons.slice(0, 12),
    selectedFacts: best.facts,

    selectedDensityA: best.densityA,
    selectedInputCount: best.inputCount,
    selectedUsedCount: best.usedCount,
    densityAThreshold,

    disqualifyAllTriggered,
    rescueTriggeredByLowDensity,
    rescueTriggeredByAbstractHead,

    attemptedExtraCount,
    extraAttempt,

    candidateScores: scored.map((s) => ({
      idx: s.idx,
      score: s.score,
      didRepair: Boolean(s.didRepair),
      disqualified: Boolean(s.disqualified),
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