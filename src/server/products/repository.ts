// src/server/products/repository.ts
/**
 * Product Repository (read-only)
 *
 * 目的:
 * - /api/writer などの呼び出し側が Prisma を直接触らずに
 *   Product / ProductSpec / ProductAttribute 情報を取得できるようにする
 * - まずは「素のDBレコードをまとめて返す」レイヤーとして定義し、
 *   Precision 用の整形レイヤーは後続フェーズで追加する
 */

import type { Product, ProductSpec, ProductAttribute } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Product / ProductSpec / ProductAttribute をひとまとめにした文脈情報。
 *
 * 現段階では「生の Prisma モデル型」をそのまま返す。
 * Precision 用にフィールドを絞る／変換するのは、後続の
 * 「ProductContext → Precision 用安全DTO」レイヤーで扱う想定。
 */
export type ProductContext = {
  product: Product;
  specs: ProductSpec[];
  attributes: ProductAttribute[];
};

/**
 * productId から ProductContext を取得する読み取り専用関数。
 *
 * - productId が null/undefined/空文字の場合は null を返す
 * - 対応する Product が見つからない場合も null を返す
 * - Product が見つかった場合のみ、その productId をもとに
 *   ProductSpec / ProductAttribute をまとめて取得して返す
 */
export async function getProductContextById(
  productId: string | null | undefined,
): Promise<ProductContext | null> {
  // productId が空なら何もしない
  if (!productId) return null;

  // まずは Product 本体を取得
  const product = await prisma.product.findUnique({
    where: { id: productId },
  });

  // 見つからなければ文脈なし
  if (!product) {
    return null;
  }

  // ProductSpec / ProductAttribute を並列で取得
  const [specs, attributes] = await Promise.all([
    prisma.productSpec.findMany({
      where: { productId },
    }),
    prisma.productAttribute.findMany({
      where: { productId },
    }),
  ]);

  return {
    product,
    specs,
    attributes,
  };
}
