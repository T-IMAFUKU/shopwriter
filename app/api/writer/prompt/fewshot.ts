// app/api/writer/prompt/fewshot.ts
/**
 * C10-2-4: Fewshot Layer（Precision Plan 用の例文レイヤー）
 *
 * 目的:
 * - Phase2（fewshot最適化）の中心となる「例文管理」を公式レイヤー化する
 * - カテゴリ × ペルソナ × トーン で例文を切り替えられる構造を用意
 *
 * 注意:
 * - 現時点ではどこからも呼ばれていない安全なスタブ実装
 * - 後続で core.ts / persona.ts / tone.ts / compose.ts と統合していく
 */

import type { NormalizedInput } from "../pipeline"; // :contentReference[oaicite:0]{index=0}
import type { PersonaKey } from "./persona";
import type { ToneKey } from "./tone";

/** Fewshot の一意キー */
export type FewshotKey = string;

/** Fewshot の構造 */
export type FewshotExample = {
  key: FewshotKey;
  /** モデルに渡す例文本体（system に混ぜることも user に混ぜることもある） */
  content: string;
  /** この fewshot が想定しているカテゴリ（"cosme" など） */
  category?: string | null;
  /** この fewshot が想定しているペルソナ */
  persona?: PersonaKey | null;
  /** この fewshot が想定しているトーン */
  tone?: ToneKey | null;
};

/**
 * 初期 fewshot 定義（最小限のサンプル）
 *
 * - 必要最小の例文だけを定義
 * - 本格的な Phase2 の段階で大量に追加・管理画面連携していく想定
 */
const FEWSHOT_STORE: FewshotExample[] = [
  {
    key: "cosme_default_1",
    category: "cosme",
    persona: "ja_ec_copywriter",
    tone: "warm_intelligent",
    content: [
      "【例文】乾燥肌の原因は “水分不足” だけではありません。",
      "外気・摩擦・エイジング要因が重なると、肌はバリア機能を失いがちです。",
      "そこで重要なのが、角質層までうるおいを届ける処方です。",
    ].join("\n"),
  },
  {
    key: "food_default_1",
    category: "food",
    persona: "ja_ec_copywriter",
    tone: "warm_intelligent",
    content: [
      "【例文】素材の味がしっかり感じられる秘密は “加工の少なさ”。",
      "余計な添加物に頼らず、自然本来の旨みを引き出す製法にこだわっています。",
    ].join("\n"),
  },
];

/** Fewshot 解決時の入力コンテキスト */
export type ResolveFewshotContext = {
  normalized: NormalizedInput;
  personaKey: PersonaKey;
  toneKey: ToneKey;
};

/** Fewshot 解決結果 */
export type ResolveFewshotResult = {
  fewshotKeys: FewshotKey[];
  examples: FewshotExample[];
};

/**
 * resolveFewshot
 *
 * - Phase2 で高度化される中心関数
 * - 現時点では「カテゴリ一致」「ペルソナ一致」「トーン一致」をゆるく優先する安全実装
 * - 完全一致が見つからなければ空配列にする（モデル負荷を避けるため）
 */
export function resolveFewshot(
  ctx: ResolveFewshotContext,
): ResolveFewshotResult {
  const { normalized, personaKey, toneKey } = ctx;

  const category = normalized.category.toString().toLowerCase();

  // (= 現在は非常にシンプルなマッチング方式)
  const matched = FEWSHOT_STORE.filter((ex) => {
    const catOk =
      !ex.category ||
      ex.category.toString().toLowerCase() === category;
    const personaOk = !ex.persona || ex.persona === personaKey;
    const toneOk = !ex.tone || ex.tone === toneKey;
    return catOk && personaOk && toneOk;
  });

  return {
    fewshotKeys: matched.map((m) => m.key),
    examples: matched,
  };
}

/** 大元の fewshot 一覧を返す（管理画面用途） */
export function listAllFewshot(): FewshotExample[] {
  return [...FEWSHOT_STORE];
}
