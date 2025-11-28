/** app/api/writer/prompt/compose.ts
 * Stage1.5(core): prompt composer 抽出 + Persona/Tone レイヤー安全接続
 * - route.ts 側の既存ロジックと併存してもビルドが通る安全実装
 * - 返却 shape は { system, user, faqBlock? } を維持（strict）
 * - tone-presets は _shared から参照
 * - persona.ts / tone.ts は「ゼロ影響シム経由」で公式接続
 * - Phase2: 推測禁止・固有情報制御の安全ガイドラインを system / user 両方に注入
 */

import type { WriterInput } from "../validation";
import { tonePresets } from "../_shared/tone-presets";

// Persona / Tone レイヤー（存在していれば使う・なければ完全スルー）
import * as personaLayer from "./persona";
import * as toneLayer from "./tone";

// Fewshot レイヤー（Precision Plan 用）
import { resolveFewshot } from "./fewshot";

/** ====== 安全最小の型 ====== */
export type TonePreset = {
  system?: string;   // システムプロンプト文
  text?: string;     // トーン説明文
  module?: string;   // 追加モジュール（任意）
  [k: string]: unknown;
};
type ToneMap = Record<string, TonePreset>;

export type ComposeResult = {
  system: string;
  user: string;
  faqBlock?: string;
};

/** ====== ユーティリティ ====== */
function S(v: unknown, fallback = ""): string {
  if (v == null) return fallback;
  try {
    if (typeof v === "string") return v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    return JSON.stringify(v);
  } catch {
    return fallback;
  }
}

/** トーン文字列の取得（存在しなければ空） */
function resolveToneText(toneKey: unknown): string {
  const key = S(toneKey).trim();
  if (!key) return "";
  const preset = (tonePresets as unknown as ToneMap)[key];
  if (!preset) return "";
  return S(preset.system) || S(preset.text) || "";
}

/** FAQ ブロック整形（Q/A 形式） */
function buildFaqBlock(
  seeds: Array<{ q: unknown; a: unknown }> | undefined
): string | undefined {
  const list = seeds?.filter(Boolean) ?? [];
  if (list.length === 0) return undefined;

  const lines: string[] = ["## FAQ"];
  for (const item of list) {
    const q = S((item as any).q).trim();
    const a = S((item as any).a).trim();
    if (!q && !a) continue;
    if (q) lines.push(`- **Q. ${q}**`);
    if (a) lines.push(`  - A. ${a}`);
  }
  return lines.join("\n");
}

/** ====== ここから “route.ts” からの実体移設（安全版） ====== */
/** NormalizedInput：最低限のキーだけ先に持つ（緩め） */
export type NormalizedInput = {
  prompt?: string;
  tone?: string | null;
  style?: string | null;
  locale?: string | null;
  language?: string | null;
  category?: string | null;
  length?: string | null;
  target?: string | null;
  audience?: string | null;
  product?: string | null;
  cta?: string | null;
  keywords?: string | null;
  notes?: string | null;
  /** CTAを複数候補で渡すケースに合わせた最低限の型 */
  cta_preference?: string[];
  [k: string]: unknown;
};

/** 任意の obj を NormalizedInput 風に寄せる（超ゆるめ・挙動不変優先） */
export function coerceToShape(obj: any, raw: string): NormalizedInput {
  const o = typeof obj === "object" && obj ? obj : {};
  const n: NormalizedInput = {
    prompt: S(o.prompt ?? raw),
    tone: S(o.tone) || null,
    style: S(o.style) || null,
    locale: S(o.locale || o.language) || null,
    language: S(o.language) || null,
    category: S(o.category) || null,
    length: S(o.length) || null,
    target: S(o.target) || null,
    audience: S(o.audience) || null,
    product: S(o.product) || null,
    cta: S(o.cta) || null,
    keywords: S(o.keywords) || null,
    notes: S(o.notes) || null,
    cta_preference: Array.isArray(o?.cta_preference)
      ? (o.cta_preference as unknown[]).map((x) => S(x)).filter(Boolean)
      : undefined,
  };
  return n;
}

export function safeLower(s: string | null | undefined): string {
  return (s ?? "").toString().trim().toLowerCase();
}

/** style→tone のフォールバック決定（なければ空文字） */
export function resolveTonePresetKey(
  inputTone?: string | null,
  inputStyle?: string | null
): string {
  const tone = safeLower(inputTone);
  if (tone) return tone;
  const style = safeLower(inputStyle);
  if (!style) return "";
  // 代表的なマッピング（必要に応じて拡張）
  const lut: Record<string, string> = {
    casual: "casual",
    friendly: "friendly",
    polite: "polite",
    professional: "professional",
    warm: "warm",
  };
  return lut[style] ?? style;
}

/** トーンの追加モジュール（任意）を文字列取得 */
export function renderToneModule(toneKey: string): string {
  const preset = (tonePresets as unknown as ToneMap)[toneKey];
  return (preset && S(preset.module)) || "";
}

/** System Prompt を決定（上書き > tonePreset > 既定） */
export function buildSystemPrompt(opts: {
  overrides?: string;
  toneKey: string;
}): string {
  const { overrides, toneKey } = opts;
  if (S(overrides).trim()) return S(overrides);

  const preset = (tonePresets as unknown as ToneMap)[toneKey];
  const fromPreset = (preset && (S(preset.system) || S(preset.text))) || "";

  if (fromPreset) return fromPreset;

  // デフォルト
  return "You are ShopWriter, a helpful Japanese copywriting assistant for e-commerce. Respond in natural, concise Japanese.";
}

/** Fewshot 有効判定（Precision Plan 用） */
function isFewshotEnabled(): boolean {
  const raw = process.env.WRITER_FEWSHOT;
  if (!raw) return false;
  const lower = raw.toString().trim().toLowerCase();
  const parts = lower.split("|");
  return parts.some(
    (p) =>
      p === "1" ||
      p === "true" ||
      p === "on" ||
      p === "yes"
  );
}

/**
 * FewShot ブロック生成
 *
 * - Precision 用の例文ブロックを組み立てる
 * - Phase1 ではカテゴリ＋固定ペルソナ/トーンで安全に解決する
 * - env(WRITER_FEWSHOT) が無効の場合は常に空文字を返す（挙動不変）
 */
export function buildFewShot(_category?: string | null): string {
  if (!isFewshotEnabled()) return "";

  const category = safeLower(_category ?? "");
  if (!category) return "";

  try {
    const result = resolveFewshot({
      normalized: { category } as any,
      // Phase1 では固定キー（今後 Persona/Tone レイヤーと連動予定）
      personaKey: "ja_ec_copywriter" as any,
      toneKey: "warm_intelligent" as any,
    } as any);

    if (!result.examples || result.examples.length === 0) {
      return "";
    }

    const header = "### 参考例文";
    const body = result.examples
      .map((ex, idx) => {
        const title = `#### 例文${idx + 1}`;
        return `${title}\n${ex.content}`;
      })
      .join("\n\n");

    return [header, body].join("\n\n").trim();
  } catch {
    // fewshot レイヤー側の例外は完全に握りつぶして挙動不変にする
    return "";
  }
}

/** User メッセージの生成（安全最小実装＋推測禁止ルール） */
export function makeUserMessage(n: NormalizedInput): string {
  const kv: string[] = [];

  if (n.product) kv.push(`- 対象プロダクト: ${n.product}`);
  if (n.audience || n.target)
    kv.push(`- 想定読者: ${n.audience || n.target}`);
  if (n.tone) kv.push(`- トーン: ${n.tone}`);
  if (n.style) kv.push(`- スタイル: ${n.style}`);
  if (n.locale || n.language)
    kv.push(`- 言語/ロケール: ${n.locale || n.language}`);
  if (n.length) kv.push(`- 分量の目安: ${n.length}`);
  if (n.cta) kv.push(`- CTA: ${n.cta}`);
  if (n.keywords) kv.push(`- キーワード: ${n.keywords}`);
  if (n.notes) kv.push(`- 備考: ${n.notes}`);
  if (n.cta_preference?.length)
    kv.push(`- cta_preference: ${n.cta_preference.join(" / ")}`);

  const meta =
    kv.length > 0
      ? ["### 条件・補助情報", kv.join("\n")].join("\n")
      : "";

  const body = S(n.prompt);

  // 推測禁止・固有情報制御を user レイヤーにも明示
  const guideLines = [
    "- 依頼文に明示された情報と、カテゴリからみて破綻しない一般的な事実だけを使ってください。",
    "- 容量・成分・寸法・重量・バッテリー持続時間・価格・割引率・レビュー数・ランキング・発売日など、具体的な数値/スペックを推測して書かないでください。",
    "- 不明な点は、ぼかした表現（例: “たっぷり”、“持ち運びやすいサイズ” など）にとどめ、固有の数値・型番・シリーズ名・カラー名などを勝手に作らないでください。",
  ].join("\n");

  const guide =
    [
      "上記の条件に基づいて、日本語で最適化した本文を作成してください。必要に応じて見出し(H2まで)と箇条書きを用い、FAQは2〜3問をQ/A形式で、最後に一文で強いCTAを提示してください。",
      "",
      "以下の安全ルールを必ず守ってください:",
      guideLines,
    ]
      .join("\n")
      .trim();

  return ["### 依頼内容", body, meta, "### 指示", guide]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

/** ====== Persona/Tone レイヤー：ゼロ影響シム ====== */

type PersonaModuleShape = {
  buildPersonaSystemFragment?: (args: {
    input: WriterInput;
    normalized: NormalizedInput;
  }) => string;
  buildPersonaHintBlock?: (args: {
    input: WriterInput;
    normalized: NormalizedInput;
  }) => string;
  [k: string]: unknown;
};

type ToneModuleShape = {
  buildToneHintBlock?: (args: {
    input: WriterInput;
    normalized: NormalizedInput;
    toneKey: string;
  }) => string;
  [k: string]: unknown;
};

function buildPersonaSystemFragment(
  input: WriterInput,
  normalized: NormalizedInput
): string {
  const mod = personaLayer as unknown as PersonaModuleShape;
  try {
    if (mod && typeof mod.buildPersonaSystemFragment === "function") {
      return S(mod.buildPersonaSystemFragment({ input, normalized })).trim();
    }
  } catch {
    // persona レイヤー側で例外が出ても route.ts 側への影響ゼロにする
  }
  return "";
}

function buildPersonaHintBlock(
  input: WriterInput,
  normalized: NormalizedInput
): string {
  const mod = personaLayer as unknown as PersonaModuleShape;
  try {
    if (mod && typeof mod.buildPersonaHintBlock === "function") {
      return S(mod.buildPersonaHintBlock({ input, normalized })).trim();
    }
  } catch {
    // no-op
  }
  return "";
}

function buildToneHintBlock(
  input: WriterInput,
  normalized: NormalizedInput,
  toneKey: string
): string {
  const mod = toneLayer as unknown as ToneModuleShape;
  try {
    if (mod && typeof mod.buildToneHintBlock === "function") {
      return S(
        mod.buildToneHintBlock({
          input,
          normalized,
          toneKey,
        })
      ).trim();
    }
  } catch {
    // no-op
  }
  return "";
}

/** ====== Phase2: 推測禁止・固有情報制御用 System フラグメント ====== */
function buildSafetySystemFragment(_normalized: NormalizedInput): string {
  // 今はカテゴリ非依存の共通ルールのみ。
  // P2-2 以降で category ごとの許容範囲を拡張する前提のベースレイヤー。
  const lines: string[] = [
    "### 安全ガイドライン（推測禁止・固有情報制御）",
    "",
    "- あなたは、依頼文で与えられた情報と、カテゴリからみて破綻しない一般的な事実だけを使って文章を作成します。",
    "- 容量・成分・原材料・寸法・重量・バッテリー持続時間・ストレージ容量・解像度・型番・発売日・価格・割引率・ポイント還元率・レビュー件数・星評価・ランキングなどの **具体的な数値やスペックを推測して新たに作らないでください。**",
    "- 存在しないブランド名・シリーズ名・カラー名・型番・キャンペーン名・受賞歴・認証マークなど、現実に確認できない固有情報をでっち上げないでください。",
    "- 不明な点がある場合は、曖昧な表現（例: “たっぷり”、“持ち運びしやすいサイズ”、“長時間快適に使えるように設計されています” など）にとどめ、具体的な数値や固有名を勝手に作らないでください。",
    "- 明らかに事実と異なる可能性が高い記述（例: “どんな肌質にも100%必ず効果が出ます”、“永久に壊れません” などの過剰な保証）は避け、あくまで一般的・妥当な表現にとどめてください。",
  ];

  return lines.join("\n").trim();
}

/** ====== メイン：プロンプト合成 ====== */
export function composePrompt(input: WriterInput): ComposeResult {
  // ---- 入力の拾い上げ（存在すれば使う。なければ空） -------------------------
  const prompt = S((input as any)?.prompt);
  const systemOverride = S((input as any)?.system);
  const toneKeyInput = S((input as any)?.tone);
  const style = S((input as any)?.style);
  const locale = S((input as any)?.locale || (input as any)?.language);

  const product = S((input as any)?.product);
  const audience = S((input as any)?.target || (input as any)?.audience);
  const length = S((input as any)?.length);
  const cta = S((input as any)?.cta);
  const keywords = S((input as any)?.keywords);
  const notes = S((input as any)?.notes);

  // FAQ シード（あれば採用）
  const faqSeeds =
    ((input as any)?.faqSeeds as Array<{ q: unknown; a: unknown }> | undefined) ??
    ((input as any)?.options?.faqSeeds as Array<{ q: unknown; a: unknown }> | undefined);

  // ---- toneキー解決 → base system 決定 ---------------------------------------
  const toneKey = resolveTonePresetKey(toneKeyInput, style);
  const baseSystem =
    S(systemOverride).trim() ||
    resolveToneText(toneKey) ||
    buildSystemPrompt({ overrides: "", toneKey });

  // ---- user の合成 -----------------------------------------------------------
  const n: NormalizedInput = coerceToShape(
    {
      prompt,
      tone: toneKey || toneKeyInput,
      style,
      locale,
      product,
      audience,
      length,
      cta,
      keywords,
      notes,
      category: (input as any)?.category,
    },
    prompt
  );

  const user = makeUserMessage(n);

  // ---- Persona / Tone 人格レイヤー -------------------------------------------
  const personaSystem = buildPersonaSystemFragment(input, n);
  const personaHint = buildPersonaHintBlock(input, n);
  const toneHint = buildToneHintBlock(input, n, toneKey);

  // ---- Fewshot ブロック（Precision ON の時だけ） -----------------------------
  const fewshotBlock = buildFewShot(n.category ?? null);

  // ---- 推測禁止・固有情報制御レイヤー ----------------------------------------
  const safetySystem = buildSafetySystemFragment(n);

  // systemPrompt に人格（persona）＋トーン（tone）＋ fewshot＋ hint ＋ safety を段階的に注入
  const system = [
    baseSystem,
    personaSystem,
    personaHint,
    toneHint,
    fewshotBlock,
    safetySystem,
  ]
    .filter(Boolean)
    .join("\n\n");

  // ---- FAQ ブロック ----------------------------------------------------------
  const faqBlock = buildFaqBlock(faqSeeds);

  return { system, user, faqBlock };
}

// ========== Stage1.5-safe shim (for Stage2 warm import) ==========
// route.ts からのゼロ影響ウォーム呼び出し用ダミー。
// 返り値なし・副作用なし。既存 composePrompt() には一切干渉しません。

/** ゼロ影響の事前ウォーム用（型非依存） */
export function composePromptSafe(_input: unknown): void {
  // no-op
}
