/**
 * src/lib/tone-presets.ts
 * - /app/api/writer/route.ts から `import * as Tone from "@/lib/tone-presets";` で読まれる前提
 * - 互換レイヤー：named/default/namespace いずれでも参照可能な形でエクスポート
 * - 最低限のプリセットを1つ同梱（"warm_intelligent"）し、実行時エラーを回避
 */

export type ToneName = "warm_intelligent" | string;

export interface TonePreset {
  name: ToneName;
  meta?: {
    tone?: ToneName;
    style?: string;
  };
  /**
   * LLMへ渡すシステム側ヒント。短文でOK（長文は不要）
   */
  system?: string;
  /**
   * 生成後加工のヒント（route側で拾えるよう key-value）
   */
  hints?: Record<string, unknown>;
}

export const DEFAULT_TONE: ToneName = "warm_intelligent";

/**
 * 最低限のデフォルトプリセット。
 * - 過度に自己宣伝しない
 * - 読み手にとって丁寧で知的な口調
 * - CTAやFAQの重複は避ける
 */
export const presets: Record<ToneName, TonePreset> = {
  warm_intelligent: {
    name: "warm_intelligent",
    meta: { tone: "warm_intelligent", style: "friendly, intelligent, respectful" },
    system:
      "日本語で、温かく知的な口調。読み手尊重。誇張を避け、根拠のある表現を。CTAやFAQの重複は避ける。",
    hints: { dedupeCTA: true, dedupeFAQ: true },
  },
};

/**
 * 名前からプリセットを取得（無ければデフォルトを返す）
 */
export function getPreset(name?: ToneName | null): TonePreset {
  const key = (name ?? DEFAULT_TONE) as ToneName;
  return presets[key] ?? presets[DEFAULT_TONE];
}

/**
 * 利用可能なトーン名一覧
 */
export function listNames(): ToneName[] {
  return Object.keys(presets) as ToneName[];
}

/**
 * ルート側の互換ヘルパ（存在すればそのまま返す）
 */
export function ensureName(name?: ToneName | null): ToneName {
  const key = (name ?? DEFAULT_TONE) as ToneName;
  return (key in presets) ? key : DEFAULT_TONE;
}

/**
 * 既定エクスポートはプリセット集合
 * - `import Tone from ...` 形式にも対応
 */
export default { presets, DEFAULT_TONE, getPreset, listNames, ensureName };
