// app/api/writer/prompt/core.ts
/**
 * C10-3: Prompt Core Layer（Precision Plan 接続・安全モード）
 *
 * 目的:
 * - persona / tone / fewshot / compose-v2 を “読むだけ” 接続する
 * - まだ実際には system/user を切り替えない（挙動ゼロ差分）
 * - Precision Phase1 に安全に進むための入口を提供する
 *
 * Phase1 追加:
 * - compose-v2 が組み立てた人格化 system/user を
 *   呼び出し元に「渡せる構造」として返す
 * - ただし本番で実際に使う system/user は従来どおり
 */

import type { NormalizedInput } from "../pipeline";
import {
  resolvePersona,
  type ResolvePersonaContext,
} from "./persona";
import {
  resolveTone,
  type ResolveToneContext,
} from "./tone";
import {
  resolveFewshot,
  type ResolveFewshotContext,
} from "./fewshot";
import {
  composePromptV2,
  type ComposePromptV2Context,
} from "./compose-v2";

/** Prompt レイヤー入力 */
export type PromptLayerContext = {
  normalized: NormalizedInput;
  systemOverride?: string | null;
  composedSystem?: string | null;
  composedUser?: string | null;
  toneKey?: string | null;
};

/** Prompt レイヤー出力 */
export type PromptLayerResult = {
  /** 実際に使われる system（従来ロジック） */
  system: string;
  /** 実際に使われる user（従来ロジック） */
  user: string;
  /** 解決された persona/tone/fewshot 情報（デバッグ・分析用） */
  personaKey: string | null;
  toneKey: string | null;
  fewshotKeys: string[];
  /** compose-v2 が組み立てた人格化 system/user（Precision 用） */
  composedSystem: string | null;
  composedUser: string | null;
};

/**
 * buildPromptLayer（Precision 接続版・安全モード）
 *
 * ※重要※
 * - ここでは Precision ロジックを “呼ぶだけ” で
 *   実際の system / user はまだ既存処理のまま返す。
 * - 挙動が変わらない＝本番APIのレスポンスは完全に不変。
 * - Phase1 では compose-v2 が作った system/user を
 *   result.composedSystem / result.composedUser に乗せて返す。
 */
export async function buildPromptLayer(
  ctx: PromptLayerContext,
): Promise<PromptLayerResult> {
  const {
    normalized,
    systemOverride,
    composedSystem,
    composedUser,
    toneKey,
  } = ctx;

  // ===== Precision Persona =====
  const personaResult = resolvePersona({
    normalized,
    requestedPersonaKey: normalized.brand_voice ?? null,
  } satisfies ResolvePersonaContext);

  // ===== Precision Tone =====
  const toneResult = resolveTone({
    normalized,
    requestedToneKey: toneKey ?? normalized.tone ?? null,
    requestedStyleKey: normalized.style ?? null,
  } satisfies ResolveToneContext);

  // ===== Precision Fewshot =====
  const fewshotResult = resolveFewshot({
    normalized,
    personaKey: personaResult.personaKey,
    toneKey: toneResult.toneKey,
  } satisfies ResolveFewshotContext);

  // ===== Compose v2（※まだ採用しない／呼ぶだけ）=====
  const composedV2 = composePromptV2({
    normalized,
    persona: personaResult.profile,
    tone: toneResult.profile,
    fewshot: fewshotResult.examples,
    systemOverride,
    composedSystem,
    composedUser,
  } satisfies ComposePromptV2Context);

  // Phase1: compose-v2 が返した人格化 system/user を安全に取り出す
  const v2System =
    composedV2 && typeof (composedV2 as any).system === "string"
      ? ((composedV2 as any).system as string)
      : null;

  const v2User =
    composedV2 && typeof (composedV2 as any).user === "string"
      ? ((composedV2 as any).user as string)
      : null;

  // ★ 重要：今は composedV2 を “採用しない”
  // （本番挙動を一切変えないためのサンドボックス）

  // system は従来通り：composedSystem → systemOverride → 空文字
  const finalSystem = (composedSystem ?? systemOverride ?? "")
    .toString()
    .trim();

  // user も従来通り：composedUser があればそれ、なければ最低限のデフォルト
  const defaultUser = [
    `【商品名】${normalized.product_name}`,
    `【カテゴリ】${normalized.category}`,
    `【ゴール】${normalized.goal}`,
  ].join("\n");

  const finalUser =
    composedUser && composedUser.toString().trim().length > 0
      ? composedUser
      : defaultUser;

  return {
    system: finalSystem,
    user: finalUser,
    personaKey: personaResult.personaKey,
    toneKey: toneResult.toneKey,
    fewshotKeys: fewshotResult.fewshotKeys,
    composedSystem: v2System,
    composedUser: v2User,
  };
}
