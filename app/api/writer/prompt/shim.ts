/** app/api/writer/prompt/shim.ts
 * Stage1.5: “影響ゼロで関連づける”安全シム（厳密版）
 * - 役割: compose の結果が良ければ採用、無効/例外なら legacy を即返す
 * - 返却 shape: { system, user, faqBlock? } を厳守（旧ロジックと互換）
 * - いまは route.ts から未参照のため、置換後も挙動は完全に不変
 * - 次ステップ: route.ts に +2 行でこの関数を呼び出し → Gate 緑確認
 */

import type { WriterInput } from "../validation";
import { composePrompt } from "./compose";

/** 旧ルートが使う“三点セット”の型 */
export type PromptTriplet = {
  system: string;
  user: string;
  faqBlock?: string;
};

/** 空白や非文字列を無効扱いで弾く */
function takeString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
}

/**
 * compose を“安全に”合流させる（同期版）
 * - 例外や空値はすべて legacy 優先
 * - FAQ は“空で上書き”しない方針
 */
export function composePromptSafe(
  input: WriterInput,
  legacy: PromptTriplet
): PromptTriplet {
  try {
    const c = composePrompt(input);
    return {
      system: takeString((c as any).system) ?? legacy.system,
      user: takeString((c as any).user) ?? legacy.user,
      faqBlock: takeString((c as any).faqBlock) ?? legacy.faqBlock,
    };
  } catch {
    return legacy;
  }
}

/**
 * 互換のための Async 版（必要時のみ使用）
 * - 実体は同期版の Promise ラッパ
 */
export async function composePromptSafeAsync(
  input: WriterInput,
  legacy: PromptTriplet
): Promise<PromptTriplet> {
  return composePromptSafe(input, legacy);
}
