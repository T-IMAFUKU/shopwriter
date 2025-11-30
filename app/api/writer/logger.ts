// app/api/writer/logger.ts
/**
 * writer logger
 *
 * 目的:
 * - /api/writer から ProductContext 関連のログを一元管理する
 * - ProductRepository の取得結果（件数 / 有無など）を簡潔に記録し、
 *   Precision Phase3 以降のデバッグをしやすくする
 *
 * 注意:
 * - 現段階では Better Stack など外部のログ基盤とはまだ接続しない
 *   （console.log ベースの安全な実装に留める）
 * - 後続フェーズで eventLog 連携などを追加できるよう、型と payload を明示しておく
 */

import type { ProductContext } from "@/server/products/repository";

/**
 * ProductContext ログ用のメタ情報。
 *
 * - source: 呼び出し元（例: "writer.pipeline" など）
 * - requestId: /api/writer リクエスト単位のID（あれば）
 * - path: 呼び出しAPIパス（例: "/api/writer" など）
 */
export type ProductContextLogMeta = {
  source?: string;
  requestId?: string;
  path?: string;
};

/**
 * ProductContext ログの最終 payload。
 *
 * - scope: ログのカテゴリ（固定）
 * - productId: 対象商品ID（なければ null）
 * - status: "found" | "missing" | "skipped"
 * - specCount: specs の件数
 * - attributeCount: attributes の件数
 * - meta: 呼び出し元から渡された任意情報
 */
export type ProductContextLogPayload = {
  scope: "writer.productContext";
  productId: string | null;
  status: "found" | "missing" | "skipped";
  specCount: number;
  attributeCount: number;
  meta: ProductContextLogMeta;
};

/**
 * ProductContext 取得結果を記録するロガー。
 *
 * - productId が falsy の場合: status === "skipped"
 * - context が null の場合: status === "missing"
 * - context が存在する場合: status === "found"
 *
 * return 値として payload を返すことで、テストコードからも検証しやすくしている。
 */
export function logProductContextStatus(options: {
  productId: string | null | undefined;
  context: ProductContext | null;
  meta?: ProductContextLogMeta;
}): ProductContextLogPayload {
  const { productId, context, meta } = options;

  const hasProductId = !!productId;
  const hasContext = !!context;

  const payload: ProductContextLogPayload = {
    scope: "writer.productContext",
    productId: productId ?? null,
    status: !hasProductId
      ? "skipped"
      : hasContext
      ? "found"
      : "missing",
    specCount: context?.specs.length ?? 0,
    attributeCount: context?.attributes.length ?? 0,
    meta: {
      ...meta,
    },
  };

  // 現段階では console.log ベースの実装に留める。
  // - test 環境ではノイズを避けるため出力しない
  // - development では JSON 文字列で読みやすく出力
  // - production では後続の Better Stack 連携などを想定しつつ、
  //   ひとまず出力を抑制しておく
  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.log("[writer] productContext", JSON.stringify(payload));
  }

  return payload;
}
