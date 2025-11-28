// app/api/writer/prompt/tone.ts
/**
 * P1-2: Tone Layer（Precision Plan 用のトーン公式レイヤー）
 *
 * 目的:
 * - Phase1 で決まった 5 つの「人格化トーン」をコード上のスキーマとして定義
 * - ユーザー表示名（日本語）と内部キー（英語）を分離し、UI / API から安全に扱えるようにする
 * - /api/writer の返却 shape には影響させない（Precision Plan 準拠）
 *
 * 注意:
 * - 現段階では route.ts / pipeline.ts からはまだ直接は呼ばれていない安全なレイヤー
 * - 既存の resolveTonePresetKey (tone-utils.ts) は現役のまま併存させる
 */

import type { NormalizedInput } from "../pipeline"; // :contentReference[oaicite:0]{index=0}

/**
 * Phase1 で定義した 5 つの公式トーンキー
 *
 * - warm_intelligent  : やさしく賢いトーン（安心＋説得の王道）
 * - friendly_pro      : 親しみプロのトーン（気さくでわかりやすい）
 * - quiet_expert      : 静かな専門家トーン（エビデンス・信頼感）
 * - sharp_sales       : キレ味セールストーン（刺して動かす）
 * - narrative_story   : 物語トーン（世界観と温度）
 */
export const CANONICAL_TONE_KEYS = [
  "warm_intelligent",
  "friendly_pro",
  "quiet_expert",
  "sharp_sales",
  "narrative_story",
] as const;

export type CanonicalToneKey = (typeof CANONICAL_TONE_KEYS)[number];

/**
 * Tone を識別するキー
 *
 * - 公式トーン: CanonicalToneKey
 * - カスタムトーン: 任意の string（将来、管理画面などから追加されることを想定）
 */
export type ToneKey = CanonicalToneKey | (string & {});

/** Tone のプロファイル情報 */
export type ToneProfile = {
  /** 一意なキー（英語の内部キー。DB・ログなどでも使用可能） */
  key: ToneKey;
  /**
   * UI 等で使う日本語ラベル
   * 例: "やさしく賢いトーン"
   */
  labelJa: string;
  /**
   * 日本語ラベルのサブコピー（トーンの一言説明）
   * 例: "安心＋説得の王道"
   */
  taglineJa: string;
  /** トーンの説明（内部メモ / ドキュメント用の詳細文） */
  description: string;
  /**
   * system プロンプト向けのヒント文
   * - 「落ち着いた」「知的」など、人格化の方向付けに利用
   */
  systemHint?: string;
  /** スタイルタグ（"warm" / "expert" など） */
  styleTags: string[];
  /** 公式トーンかどうか（Phase1 で定義した 5 トーンなら true） */
  isCanonical: boolean;
};

/** Tone 解決時の入力コンテキスト */
export type ResolveToneContext = {
  /** normalizeInput 済みの入力 */
  normalized: NormalizedInput;
  /** ユーザーが明示指定した tone（なければ null/undefined） */
  requestedToneKey?: string | null;
  /** style（"summary" / "detail" など）からのヒント（将来拡張用） */
  requestedStyleKey?: string | null;
};

/** Tone 解決結果 */
export type ResolveToneResult = {
  /** 採用された Tone のキー */
  toneKey: ToneKey;
  /** 採用された Tone プロファイル */
  profile: ToneProfile;
};

/** デフォルトのトーンキー（現行仕様との互換用） */
export const DEFAULT_TONE_KEY: CanonicalToneKey = "warm_intelligent";

/**
 * Phase1 で決定した 5 つの人格トーン定義
 *
 * - UI は labelJa / taglineJa を利用
 * - API / ログは key（英語）を利用
 */
const TONE_PROFILES: Record<CanonicalToneKey, ToneProfile> = {
  warm_intelligent: {
    key: "warm_intelligent",
    labelJa: "やさしく賢いトーン",
    taglineJa: "安心＋説得の王道",
    description:
      "読者にやさしく寄り添いながら、論理的でわかりやすく説得するトーン。ShopWriter のデフォルトとして想定される、安心感と知性のバランスが取れたスタイルです。",
    systemHint:
      "丁寧でやさしい語り口で、読者に寄り添いながらも、論理的で分かりやすい日本語で説明してください。",
    styleTags: ["warm", "intelligent", "trustworthy"],
    isCanonical: true,
  },
  friendly_pro: {
    key: "friendly_pro",
    labelJa: "親しみプロのトーン",
    taglineJa: "気さくでわかりやすい",
    description:
      "専門知識はしっかり持ちつつも、フレンドリーで話しかけやすい雰囲気のトーン。カジュアルな語り口で、専門用語をかみくだいて説明するスタイルです。",
    systemHint:
      "プロとしての知識を持ちながらも、友人に話すような親しみやすい言葉で、専門用語をかみくだいて説明してください。",
    styleTags: ["friendly", "pro", "casual", "approachable"],
    isCanonical: true,
  },
  quiet_expert: {
    key: "quiet_expert",
    labelJa: "静かな専門家トーン",
    taglineJa: "エビデンス・信頼感",
    description:
      "落ち着いたトーンで、事実やデータを丁寧に示しながら説得するスタイル。過度な感情表現を避け、専門家としての信頼感を重視します。",
    systemHint:
      "落ち着いたトーンで、事実やデータ、根拠を丁寧に示しながら説明してください。不要な煽りや過度な感情表現は避け、専門家としての信頼感を大切にしてください。",
    styleTags: ["expert", "calm", "evidence", "trustworthy"],
    isCanonical: true,
  },
  sharp_sales: {
    key: "sharp_sales",
    labelJa: "キレ味セールストーン",
    taglineJa: "刺して動かす",
    description:
      "行動喚起を明確にし、メリットやベネフィットを鋭く訴求するセールス寄りのトーン。読み手の背中を押すことを重視します。",
    systemHint:
      "読み手の課題とメリットをはっきり示し、行動喚起（購入・問い合わせなど）を明確にしてください。煽りすぎない範囲で、背中を押すセールスコピーを意識してください。",
    styleTags: ["sales", "sharp", "cta", "persuasive"],
    isCanonical: true,
  },
  narrative_story: {
    key: "narrative_story",
    labelJa: "物語トーン",
    taglineJa: "世界観と温度",
    description:
      "ストーリーや情景を描きながら、世界観やブランドの温度感を伝えるトーン。ビフォー・アフターやお客様のストーリーを織り交ぜて魅力を伝えます。",
    systemHint:
      "読者が情景を思い描けるように、ビフォー・アフターやストーリーを交えて商品・サービスの魅力を伝えてください。世界観やブランドの温度感を大事にしつつ、最終的なメリットも分かるようにしてください。",
    styleTags: ["story", "emotional", "worldview"],
    isCanonical: true,
  },
};

/** 指定 key が存在しない場合に使うフォールバック ToneProfile を生成 */
function createFallbackToneProfile(key: ToneKey): ToneProfile {
  return {
    key,
    labelJa: `カスタムトーン（${key}）`,
    taglineJa: "事前定義されていないカスタムトーン",
    description:
      "事前定義されていないトーンキーです。プロンプト側で追加ルールを与える前提のカスタムトーンとして扱われます。",
    styleTags: ["custom"],
    isCanonical: false,
  };
}

/**
 * resolveTone
 *
 * - Phase1 以降で人格化された tone を決定する中心関数
 * - 現時点では「requestedToneKey / normalized.tone / デフォルト」の順に採用するだけの安全実装
 * - 後続ステップで persona / style / fewshot との連携を追加していく
 *
 * ※ /api/writer のレスポンス shape には影響しないよう、戻り値は内部利用専用の構造を維持
 */
export function resolveTone(ctx: ResolveToneContext): ResolveToneResult {
  const { normalized, requestedToneKey, requestedStyleKey } = ctx;

  // 1. ユーザー指定が最優先
  let key: ToneKey | null =
    (requestedToneKey ?? "").toString().trim() || null;

  // 2. normalizeInput 済みの tone を次に採用
  if (!key && normalized.tone) {
    key = normalized.tone.toString().trim() || null;
  }

  // 3. style 情報からのヒント（今後の拡張ポイント）
  //    - 現時点ではロジックを入れず、後続 Phase で実装予定
  const _styleHint =
    (requestedStyleKey ?? normalized.style ?? "")
      .toString()
      .trim() || null;
  // TODO: styleHint に応じて key を変える処理は Phase1 以降で導入

  // 4. それでも決まらなければデフォルトトーン
  const effectiveKey: ToneKey = (key as ToneKey) || DEFAULT_TONE_KEY;

  const canonicalProfile =
    (TONE_PROFILES as Record<string, ToneProfile>)[effectiveKey];
  const profile = canonicalProfile ?? createFallbackToneProfile(effectiveKey);

  return {
    toneKey: profile.key,
    profile,
  };
}

/**
 * getToneProfile
 *
 * - 既知の ToneProfile を直接参照したい場合に利用
 * - 無ければフォールバックを返す
 */
export function getToneProfile(key: ToneKey): ToneProfile {
  const canonicalProfile =
    (TONE_PROFILES as Record<string, ToneProfile>)[key];
  return canonicalProfile ?? createFallbackToneProfile(key);
}

/**
 * listToneProfiles
 *
 * - UI や管理画面から「選択可能なトーン一覧」を取得する用途を想定
 * - Phase1 では「公式 5 トーン」のみを返す
 */
export function listToneProfiles(): ToneProfile[] {
  return CANONICAL_TONE_KEYS.map((key) => TONE_PROFILES[key]);
}
