﻿// tests/contracts/share.contract.test.ts
// 目的：share 契約の OK/NG を分かりやすく確認する。
// 前提：@/contracts/share から shareCreateSchema / shareListQuerySchema を import（小文字名）。
// 想定：Createは { title, slug, isPublic? }（title/slug 必須）。Listは {} のみ許可（strict）。

import { describe, it, expect } from "vitest";
import { shareCreateSchema, shareListQuerySchema } from "@/contracts";

// NG判定の共通ヘルパ（エラー文言には依存しない）
function expectInvalid(
  result:
    | ReturnType<typeof shareCreateSchema.safeParse>
    | ReturnType<typeof shareListQuerySchema.safeParse>
) {
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(Array.isArray(result.error.issues)).toBe(true);
    expect(result.error.issues.length).toBeGreaterThan(0);
  }
}

/* =======================
   Create（作成）スキーマ
   必須：title, slug
   任意：isPublic（true/false）
   ======================= */
describe("contracts/share — shareCreateSchema", () => {
  // --- OK（既存OK想定を維持） ---
  it("OK: 必要最小（title と slug のみ）", () => {
    const input = { title: "テストタイトル", slug: "valid-slug" };
    const result = shareCreateSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(typeof result.data.title).toBe("string");
      expect(typeof result.data.slug).toBe("string");
    }
  });

  it("OK: 追加項目あり（isPublic を true にする）", () => {
    const input = { title: "Summer Sale 2025", slug: "summer-sale-2025", isPublic: true };
    const result = shareCreateSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isPublic).toBe(true);
    }
  });

  // --- NG（追加：必須欠落 / 空文字 / 型不一致 / 形式違反 / 境界） ---
  it("NG: 必須不足（slug が無い）", () => {
    const input: any = { title: "タイトルのみ" };
    const result = shareCreateSchema.safeParse(input);
    expectInvalid(result);
  });

  it("NG: 必須不足（title が無い）", () => {
    const input: any = { slug: "only-slug" };
    const result = shareCreateSchema.safeParse(input);
    expectInvalid(result);
  });

  it('NG: 空文字（title="" は最小長違反）', () => {
    const input = { title: "", slug: "ok-slug" };
    const result = shareCreateSchema.safeParse(input);
    expectInvalid(result);
  });

  it('NG: 型不一致（isPublic に文字列 "true" を渡す）', () => {
    const input: any = { title: "OK", slug: "ok-slug", isPublic: "true" };
    const result = shareCreateSchema.safeParse(input);
    expectInvalid(result);
  });

  it('NG: slug 形式違反（スペース含む "hello world"）', () => {
    const input = { title: "OK", slug: "hello world" };
    const result = shareCreateSchema.safeParse(input);
    expectInvalid(result);
  });

  it('NG: slug が短すぎる（"ab" の2文字）', () => {
    const input = { title: "OK", slug: "ab" };
    const result = shareCreateSchema.safeParse(input);
    expectInvalid(result);
  });
});

/* =======================
   List（一覧クエリ）スキーマ
   いまは空の {} だけOK。余分なキーはNG（strict想定）。
   ======================= */
describe("contracts/share — shareListQuerySchema", () => {
  // --- OK（既存OK想定を維持） ---
  it("OK: 空の {} を受け付ける", () => {
    const input = {};
    const result = shareListQuerySchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  // --- NG（追加：余分キー/型不一致） ---
  it("NG: 追加キー（limit）を渡す", () => {
    const input = { limit: 10 } as any;
    const result = shareListQuerySchema.safeParse(input);
    expectInvalid(result);
  });

  it("NG: 追加キー（cursor）を渡す", () => {
    const input = { cursor: "abc" } as any;
    const result = shareListQuerySchema.safeParse(input);
    expectInvalid(result);
  });

  it("NG: 追加キーを複数渡す（limit と cursor）", () => {
    const input = { limit: 10, cursor: "abc" } as any;
    const result = shareListQuerySchema.safeParse(input);
    expectInvalid(result);
  });
});
