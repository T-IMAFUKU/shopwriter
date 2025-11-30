/** app/api/writer/validation.ts - Stage1: 素通し、後でZod化（P3-1: productId 型追加） */

/**
 * WriterInput
 * - Phase3 用に productId を型レベルで受け取れるようにする
 * - まだ挙動は変えず、Record<string, unknown> の素通しを維持
 */
export type WriterInput = Record<string, unknown> & {
  /** 商品DBと紐づけるための Product ID（未指定 or 無効時は null / undefined 想定） */
  productId?: string | null;
};

/**
 * parseInput
 * - 現段階では「オブジェクトならそのまま素通し」の最小実装
 * - 後続フェーズで Zod バリデーションや productId 正規化を追加予定
 */
export function parseInput(raw: unknown): WriterInput {
  if (raw && typeof raw === "object") return raw as WriterInput;
  return {};
}
