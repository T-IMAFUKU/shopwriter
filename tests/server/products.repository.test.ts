// tests/server/products.repository.test.ts
import { describe, test, expect } from "vitest";
import { getProductContextById } from "@/server/products/repository";

/**
 * Product Repository 単体テスト
 *
 * 目的:
 * - getProductContextById の基本的な振る舞い（null / undefined / 空文字 / 存在しないID）を確認する
 * - まだ Product データの公式シードがない段階なので、
 *   「例外を投げずに null を返す」パスをスモークテストする
 */

describe("Product Repository / getProductContextById", () => {
  test("productId が null のときは null を返す", async () => {
    await expect(getProductContextById(null)).resolves.toBeNull();
  });

  test("productId が undefined のときは null を返す", async () => {
    await expect(getProductContextById(undefined)).resolves.toBeNull();
  });

  test("productId が空文字のときは null を返す", async () => {
    await expect(getProductContextById("")).resolves.toBeNull();
  });

  test("存在しない productId のときは null を返す", async () => {
    const nonExistingId = "00000000-0000-0000-0000-000000000000";
    const result = await getProductContextById(nonExistingId);
    expect(result).toBeNull();
  });
});
