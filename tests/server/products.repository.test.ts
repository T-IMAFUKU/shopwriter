// tests/server/products.repository.test.ts
import { beforeEach, describe, expect, test, vi } from "vitest";

const prismaMocks = vi.hoisted(() => {
  return {
    productFindUnique: vi.fn(),
    productSpecFindMany: vi.fn(),
    productAttributeFindMany: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    product: {
      findUnique: prismaMocks.productFindUnique,
    },
    productSpec: {
      findMany: prismaMocks.productSpecFindMany,
    },
    productAttribute: {
      findMany: prismaMocks.productAttributeFindMany,
    },
  },
}));

import { getProductContextById } from "@/server/products/repository";

/**
 * Product Repository 単体テスト
 *
 * 目的:
 * - getProductContextById の基本的な振る舞い（null / undefined / 空文字 / 存在しないID）を確認する
 * - DB 接続可否に依存させず、関数の分岐を安定して検証する
 * - 「存在しないIDなら null」を unit test として保証する
 */

describe("Product Repository / getProductContextById", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMocks.productFindUnique.mockReset();
    prismaMocks.productSpecFindMany.mockReset();
    prismaMocks.productAttributeFindMany.mockReset();
  });

  test("productId が null のときは null を返す", async () => {
    await expect(getProductContextById(null)).resolves.toBeNull();

    expect(prismaMocks.productFindUnique).not.toHaveBeenCalled();
    expect(prismaMocks.productSpecFindMany).not.toHaveBeenCalled();
    expect(prismaMocks.productAttributeFindMany).not.toHaveBeenCalled();
  });

  test("productId が undefined のときは null を返す", async () => {
    await expect(getProductContextById(undefined)).resolves.toBeNull();

    expect(prismaMocks.productFindUnique).not.toHaveBeenCalled();
    expect(prismaMocks.productSpecFindMany).not.toHaveBeenCalled();
    expect(prismaMocks.productAttributeFindMany).not.toHaveBeenCalled();
  });

  test("productId が空文字のときは null を返す", async () => {
    await expect(getProductContextById("")).resolves.toBeNull();

    expect(prismaMocks.productFindUnique).not.toHaveBeenCalled();
    expect(prismaMocks.productSpecFindMany).not.toHaveBeenCalled();
    expect(prismaMocks.productAttributeFindMany).not.toHaveBeenCalled();
  });

  test("存在しない productId のときは null を返す", async () => {
    const nonExistingId = "00000000-0000-0000-0000-000000000000";
    prismaMocks.productFindUnique.mockResolvedValue(null);

    const result = await getProductContextById(nonExistingId);

    expect(result).toBeNull();
    expect(prismaMocks.productFindUnique).toHaveBeenCalledTimes(1);
    expect(prismaMocks.productFindUnique).toHaveBeenCalledWith({
      where: { id: nonExistingId },
    });
    expect(prismaMocks.productSpecFindMany).not.toHaveBeenCalled();
    expect(prismaMocks.productAttributeFindMany).not.toHaveBeenCalled();
  });
});
