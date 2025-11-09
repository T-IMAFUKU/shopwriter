/** app/api/writer/prompt/compose.ts
 * Stage1(core): route.ts から切り出す“プロンプト組み立て”の受け皿（挙動不変優先）
 * - 当面は route.ts 側の既存ロジックと併存してもビルドが通るように安全設計
 * - 返却 shape は { system, user, faqBlock? } を維持（あなた案に合わせる）
 * - tone-presets は _shared から参照
 */

import type { WriterInput } from "../validation";
import { tonePresets } from "../_shared/tone-presets";

/** 返却型 */
export type ComposeResult = {
  system: string;
  user: string;
  faqBlock?: string;
};

/** ユーティリティ（型ゆるめ：挙動不変最優先） */
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
  // tonePresets の構造はプロジェクト依存。代表パターンに寄せて安全に参照。
  // 例: { warm_intelligent: { system: "...", ... }, ... }
  const preset: any = (tonePresets as any)?.[key];
  if (!preset) return "";
  return S(preset.system) || S(preset.text) || "";
}

/** FAQ ブロック整形（Q/A 形式） */
function buildFaqBlock(seeds: Array<{ q: unknown; a: unknown }> | undefined): string | undefined {
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

/** メイン：プロンプトを合成
 *  - 将来：route.ts の既存ロジックを“丸ごと”ここへ移植（今は安全な互換実装）
 */
export function composePrompt(input: WriterInput): ComposeResult {
  // ---- 入力の拾い上げ（存在すれば使う。なければ空） -------------------------
  const prompt = S((input as any)?.prompt);
  const systemOverride = S((input as any)?.system);
  const toneKey = S((input as any)?.tone);
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

  // ---- system の決定（上書き > tonePreset > 既定） -------------------------
  const toneText = resolveToneText(toneKey);
  const defaultSystem =
    "You are ShopWriter, a helpful Japanese copywriting assistant for e-commerce. Respond in natural, concise Japanese.";
  const system = systemOverride || toneText || defaultSystem;

  // ---- user の合成（route.ts からの移植先：見出しベースで接続） -------------
  const sections: string[] = [];

  if (prompt) {
    sections.push("### 依頼内容"); // 本文
    sections.push(prompt);
  }

  // メタ指示の補助（存在するものだけ添える）
  const metaLines: string[] = [];
  if (style) metaLines.push(`- スタイル: ${style}`);
  if (toneKey) metaLines.push(`- トーン: ${toneKey}`);
  if (locale) metaLines.push(`- 言語/ロケール: ${locale}`);
  if (length) metaLines.push(`- 分量の目安: ${length}`);
  if (audience) metaLines.push(`- 想定読者: ${audience}`);
  if (product) metaLines.push(`- 対象プロダクト: ${product}`);
  if (cta) metaLines.push(`- 望ましいCTA: ${cta}`);
  if (keywords) metaLines.push(`- キーワード: ${keywords}`);
  if (notes) metaLines.push(`- 備考: ${notes}`);

  if (metaLines.length > 0) {
    sections.push("### 条件・補助情報");
    sections.push(metaLines.join("\n"));
  }

  // ---- FAQ ブロック ----------------------------------------------------------
  const faqBlock = buildFaqBlock(faqSeeds);

  // ---- user 文字列 -----------------------------------------------------------
  const user = sections.join("\n\n").trim();

  return { system, user, faqBlock };
}
