// app/api/writer/prompt/tone.ts
/**
 * C10-2-2: Tone Layer（Precision Plan 用のトーン公式レイヤー）
 *
 * 目的:
 * - route.ts / pipeline.ts / compose.ts に散らばっている tone 関連ロジックを集約するための土台
 * - Phase1〜3 で「人格化されたトーン」を注入する公式の入口を用意する
 *
 * 注意:
 * - 現段階ではどこからも呼ばれていない安全なスタブ実装
 * - 既存の resolveTonePresetKey (tone-utils.ts) はまだ現役のまま
 */

import type { NormalizedInput } from "../pipeline"; // :contentReference[oaicite:0]{index=0}

/** Tone を識別するキー（現状は string として柔軟に扱う） */
export type ToneKey = string;

/** Tone のプロファイル情報 */
export type ToneProfile = {
  /** 一意なキー（DB・ログなどでも使用可能） */
  key: ToneKey;
  /** UI 等で使うラベル */
  label: string;
  /** トーンの説明（内部メモ用） */
  description: string;
  /**
   * system プロンプト向けのヒント文
   * - 「落ち着いた」「知的」など、人格化の方向付けに利用
   */
  systemHint?: string;
  /** スタイルタグ（"warm" / "expert" など） */
  styleTags: string[];
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
export const DEFAULT_TONE_KEY: ToneKey = "warm_intelligent";

/**
 * 将来的に UI / 設定から編集可能な TONE_PROFILES の初期値
 * - ここでは最小限のプリセットだけを定義
 * - 実際のプロンプト文は compose / persona 側で組み立てる想定
 */
const TONE_PROFILES: Record<ToneKey, ToneProfile> = {
  warm_intelligent: {
    key: "warm_intelligent",
    label: "あたたかく知的",
    description:
      "読者に寄り添いながらも、専門性と信頼感のあるトーン。ShopWriter のデフォルト。",
    systemHint:
      "読者に寄り添いながらも、論理的で分かりやすい日本語で説明してください。",
    styleTags: ["warm", "intelligent", "trustworthy"],
  },
};

/** 指定 key が存在しない場合に使うフォールバック ToneProfile を生成 */
function createFallbackToneProfile(key: ToneKey): ToneProfile {
  return {
    key,
    label: `カスタムトーン(${key})`,
    description:
      "事前定義されていないトーンキー。プロンプト側で追加ルールを与える前提のカスタムトーンです。",
    styleTags: ["custom"],
  };
}

/**
 * resolveTone
 *
 * - Phase1 以降で人格化された tone を決定する中心関数
 * - 現時点では「requestedToneKey / normalized.tone / デフォルト」の順に採用するだけの安全実装
 * - 後続ステップで persona / style / fewshot との連携を追加していく
 */
export function resolveTone(
  ctx: ResolveToneContext,
): ResolveToneResult {
  const { normalized, requestedToneKey, requestedStyleKey } = ctx;

  // 1. ユーザー指定が最優先
  let key: ToneKey | null =
    (requestedToneKey ?? "").toString().trim() || null;

  // 2. normalizeInput 済みの tone を次に採用
  if (!key && normalized.tone) {
    key = normalized.tone.toString().trim() || null;
  }

  // 3. style 情報からのヒント（今後の拡張ポイント）
  //    - 現時点ではロジックを入れず、後続 C10/Phase1 で実装予定
  const _styleHint =
    (requestedStyleKey ?? normalized.style ?? "")
      .toString()
      .trim() || null;
  // TODO: styleHint に応じて key を変える処理は Phase1 以降で導入

  // 4. それでも決まらなければデフォルトトーン
  const effectiveKey: ToneKey = key || DEFAULT_TONE_KEY;

  const profile =
    TONE_PROFILES[effectiveKey] ?? createFallbackToneProfile(effectiveKey);

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
  return TONE_PROFILES[key] ?? createFallbackToneProfile(key);
}

/**
 * listToneProfiles
 *
 * - UI や管理画面から「選択可能なトーン一覧」を取得する用途を想定
 */
export function listToneProfiles(): ToneProfile[] {
  return Object.values(TONE_PROFILES);
}
