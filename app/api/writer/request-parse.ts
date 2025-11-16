/**
 * app/api/writer/request-parse.ts
 *
 * B-3-1: Request parsing + prompt compose の集約ポイント（まだ route.ts からは未使用）
 * - parseWriterRequest(req) で Request 全体を安全に解釈
 * - parseInput で WriterInput を構築
 * - composePromptSafe で将来用の warmup（no-op）
 * - composePrompt で実際に system/user/faqBlock を組み立て
 *
 * ※ 現時点では「ヘルパーとして定義のみ」。route.ts からは B-3-2 以降で利用。
 */

import { parseWriterRequest } from "./parse";
import { parseInput } from "./validation";
import { composePromptSafe, composePrompt } from "./prompt/compose";
import type { WriterInput } from "./validation";

/**
 * composePrompt の返却型をそのまま利用するためのヘルパー型
 * - { system, user, faqBlock? } を想定
 */
export type ComposedPrompt = ReturnType<typeof composePrompt>;

/**
 * WriterRequestContext
 * - Request 1 件分を処理するための中間コンテキスト
 * - B-3 系以降で route.ts から利用予定
 *
 * raw:
 *  - parseWriterRequest で一度検証済みのリクエスト本体
 *  - route.ts 側では provider/model などを拾うためにプロパティアクセスする
 *  - ここでは型安全よりも「既存挙動維持」を優先して any に緩める
 */
export type WriterRequestContext = {
  /** normalize + パース済みの WriterInput */
  input: WriterInput;
  /** composePrompt の結果（system / user / faqBlock?） */
  composed: ComposedPrompt;
  /** parseWriterRequest の生データ（既存挙動維持のため any） */
  raw: any;
};

/**
 * buildWriterRequestContext
 * - Request → parseWriterRequest → parseInput → composePromptSafe/composePrompt
 *   までを一気通貫で処理するヘルパー。
 *
 * 返却 shape:
 * - ok: false の場合 → parseWriterRequest 段階のエラーをそのまま返す
 * - ok: true の場合  → WriterRequestContext を data に格納して返す
 */
export async function buildWriterRequestContext(req: Request) {
  const parsed = await parseWriterRequest(req);

  if (!parsed.ok) {
    // ここでは shape を壊さないように、parseWriterRequest の返却をそのまま返す。
    return parsed;
  }

  const reqInput = parsed.data;

  // WriterInput への変換
  const input = parseInput(reqInput as any);

  // Stage2-safe: no-op warm call（挙動不変・将来用のシム）
  void composePromptSafe(input);

  // 実際に利用するプロンプトを組み立て
  const composed = composePrompt(input);

  const ctx: WriterRequestContext = {
    input,
    composed,
    raw: reqInput,
  };

  return {
    ok: true as const,
    data: ctx,
  };
}
