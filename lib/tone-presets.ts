/* eslint-disable @typescript-eslint/consistent-type-definitions */
/**
 * lib/tone-presets.ts
 * ------------------------------------------------------------
 * ShopWriter の出力トーンを「人格」として定義するプリセット。
 * 本ファイルは H-7 Phase 1（正式仕様）に基づく**唯一の定義源**です。
 *
 * ✅ 提供するもの
 *  - ToneId 型（'formal' | 'warm_intelligent' | 'emotional_sincere'）
 *  - TonePreset 型
 *  - TONE_PRESETS: Record<ToneId, TonePreset>
 *  - normalizeToneId(): UI/外部からの入力を既定3種へ正規化
 *  - safeCtaFor(): 人格に沿ったCTA案のうち先頭を返す
 *
 * 🚫 やらないこと
 *  - LLM プロンプト組立てや postProcess の実装は本ファイルではしない
 *    （呼び出し側で禁止語除去・語尾バラし等の手続を適用する想定）
 */

export type ToneId = "formal" | "warm_intelligent" | "emotional_sincere";

export type TonePreset = {
  /** 固定ID（API/テストの参照に利用） */
  id: ToneId;
  /** UI表示用ラベル */
  label: string;
  /** その人格の要約説明（ドキュメント/QA向け） */
  description: string;

  /** 文章内に含めない語句（正規表現）。postProcess で除去/言い換え対象。 */
  forbidden: RegExp[];

  /** 終止の候補（語尾プール）。連続3回の同一語尾は禁止（呼び出し側で制御）。 */
  endings: string[];

  /** 文頭・文中に挿入できる接続語。 */
  connectives: string[];

  /** CTA 動詞/句プリセット（人格に合う順）。 */
  ctaVerbs: string[];

  /** モバイル可読性のルール（呼び出し側で利用）。 */
  mobileRules: {
    /** 1行の目安最大文字数（スマホ） */
    lineMaxChars: number;
    /** 1塊の最大文数 */
    sentenceMaxPerBlock: number;
    /** 行頭禁則（句読点/中黒/閉じ括弧 等）。 */
    forbidLeadingChars: RegExp;
    /** 三点リーダ最大（段落末のみ、2個まで） */
    maxEllipsisPerParagraph: number;
  };
};

/** 共通：禁止語（全人格） */
const COMMON_FORBIDDEN: RegExp[] = [
  /革命的/g,
  /神レベル/g,
  /永久無料/g,
  /100%/g,
  /絶対/g,
  /誰でも秒で/g,
  /最強/g,
  /バズる/g,
];

/** formal */
const PRESET_FORMAL: TonePreset = {
  id: "formal",
  label: "フォーマル",
  description:
    "客観・信頼・制度的安心。事実→根拠→結語の三段で、丁寧で距離感はやや遠め。",
  forbidden: [...COMMON_FORBIDDEN, /ワクワク/g, /圧倒的/g, /すぐに変わる/g],
  endings: [
    "です。",
    "します。",
    "となります。",
    "に該当します。",
    "を推奨します。",
  ],
  connectives: ["一方で", "まず", "次に", "なお", "したがって", "そのため"],
  ctaVerbs: ["詳細を確認", "要件を見る", "手順ガイドへ"],
  mobileRules: {
    lineMaxChars: 36,
    sentenceMaxPerBlock: 3,
    forbidLeadingChars: /^[、。・）」］】》】]/u,
    maxEllipsisPerParagraph: 2,
  },
};

/** warm_intelligent（既定） */
const PRESET_WARM_INTELLIGENT: TonePreset = {
  id: "warm_intelligent",
  label: "温かい×知的",
  description:
    "伴走・納得・専門性。やさしい抑揚で要点を噛み砕き、心理的負担を下げる標準人格。",
  forbidden: [...COMMON_FORBIDDEN, /すごい/g, /とにかく/g, /ですよ！/g],
  endings: [
    "できます。",
    "しやすくなります。",
    "に役立ちます。",
    "が整います。",
    "で安心です。",
  ],
  connectives: ["だから", "そのまま", "まず", "結果", "たとえば"],
  ctaVerbs: ["無料で試す", "まずは触ってみる", "仕組みを見る"],
  mobileRules: {
    lineMaxChars: 36,
    sentenceMaxPerBlock: 3,
    forbidLeadingChars: /^[、。・）」］】》】]/u,
    maxEllipsisPerParagraph: 2,
  },
};

/** emotional_sincere */
const PRESET_EMOTIONAL_SINCERE: TonePreset = {
  id: "emotional_sincere",
  label: "情緒×誠実",
  description:
    "共感・動機・背中押し。煽らず、静かな感情で『続けられる』に寄り添う。",
  forbidden: [
    ...COMMON_FORBIDDEN,
    /胸が震える/g,
    /奇跡/g,
    /今すぐやれ/g,
    /！{1,}/g, // 強いビックリ多用禁止
  ],
  endings: ["だから。", "で、いい。", "していけます。", "で、一歩。"],
  connectives: ["だから", "それでも", "ゆっくり", "少しずつ", "きっと"],
  ctaVerbs: ["今日から少し、軽くする", "一緒に始める", "無理なく試す"],
  mobileRules: {
    lineMaxChars: 36,
    sentenceMaxPerBlock: 3,
    forbidLeadingChars: /^[、。・）」］】》】]/u,
    maxEllipsisPerParagraph: 2,
  },
};

export const TONE_PRESETS: Record<ToneId, TonePreset> = {
  formal: PRESET_FORMAL,
  warm_intelligent: PRESET_WARM_INTELLIGENT,
  emotional_sincere: PRESET_EMOTIONAL_SINCERE,
} as const;

/**
 * UIや旧値からの受け口。未定義・異常値は標準人格（warm_intelligent）に丸め込む。
 * - "friendly" や "friendly_warm" は warm_intelligent に正規化
 * - 大文字小文字は無視
 */
export function normalizeToneId(input: unknown): ToneId {
  const raw =
    typeof input === "string" ? (input as string).trim().toLowerCase() : "";
  if (raw === "formal") return "formal";
  if (raw === "warm_intelligent" || raw === "warm" || raw === "friendly" || raw === "friendly_warm")
    return "warm_intelligent";
  if (raw === "emotional_sincere" || raw === "emotional")
    return "emotional_sincere";
  // 既定は温かい×知的
  return "warm_intelligent";
}

/** 安全な CTA（人格に合う先頭案）を返す。 */
export function safeCtaFor(tone: ToneId): string {
  const p = TONE_PRESETS[tone];
  return p?.ctaVerbs?.[0] ?? "詳しく見る";
}

/** 型のエクスポート（ルートでの import 用） */
export type { TonePreset as ShopWriterTonePreset };

export default TONE_PRESETS;
