// contracts/share.ts
// ────────────────────────────────────────────────────────────
// ShopWriter: Share 契約（Zod）
// 目的：API / UI / Page がこの契約のみを参照する単一の真実源（SSOT）
// 言語：TypeScript + Zod
// 注意：メッセージは日本語、将来拡張に備え共通型を分割
// ────────────────────────────────────────────────────────────

import { z } from "zod";

/* ----------------------------------------------------------------
 * 共通スキーマ（再利用前提）
 * ---------------------------------------------------------------- */
export const idSchema = z
  .string({
    required_error: "ID は必須です。",
    invalid_type_error: "ID は文字列で指定してください。",
  })
  .uuid({ message: "ID は UUID 形式で指定してください。" });

export const titleSchema = z
  .string({
    required_error: "タイトルは必須です。",
    invalid_type_error: "タイトルは文字列で指定してください。",
  })
  .trim()
  .min(1, { message: "タイトルは1文字以上で入力してください。" })
  .max(100, { message: "タイトルは100文字以内で入力してください。" });

/**
 * スラッグ：英小文字・数字・ハイフンのみ、3〜50文字
 * 例: "summer-sale-2025"
 */
export const slugSchema = z
  .string({
    required_error: "スラッグは必須です。",
    invalid_type_error: "スラッグは文字列で指定してください。",
  })
  .min(3, { message: "スラッグは3文字以上で入力してください。" })
  .max(50, { message: "スラッグは50文字以内で入力してください。" })
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      "スラッグは英小文字・数字・ハイフンのみ使用できます（先頭/末尾ハイフン不可）。",
  });

/**
 * ISO 8601 形式の日時文字列
 * Zod 3.22+ の datetime() を使用。タイムゾーン付きも許容。
 */
export const isoDateTimeSchema = z
  .string({
    required_error: "日時は必須です。",
    invalid_type_error: "日時は文字列で指定してください。",
  })
  .datetime({ message: "日時は ISO 8601 形式で指定してください。" });

export const booleanSchema = z.boolean({
  required_error: "真偽値を指定してください。",
  invalid_type_error: "真偽値を指定してください。",
});

/* ----------------------------------------------------------------
 * エンティティ（DB/出力想定）
 * ---------------------------------------------------------------- */
export const shareSchema = z
  .object({
    id: idSchema,
    title: titleSchema,
    slug: slugSchema,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
    isPublic: booleanSchema,
  })
  .strict();

export type Share = z.infer<typeof shareSchema>;

/* ----------------------------------------------------------------
 * 入力：作成
 *  - 作成時に必要な最小項目のみ
 *  - isPublic は未指定なら false をデフォルトにする運用を推奨（API側で補完可）
 * ---------------------------------------------------------------- */
export const shareCreateSchema = z
  .object({
    title: titleSchema,
    slug: slugSchema,
    isPublic: booleanSchema.optional(), // デフォルト付与はAPI側で
  })
  .strict();

export type ShareCreateInput = z.infer<typeof shareCreateSchema>;

/* ----------------------------------------------------------------
 * 入力：更新
 *  - 仕様メモに従い、更新対象は「タイトル」「公開フラグ」のみ
 *  - どちらか最低1項目は必須
 * ---------------------------------------------------------------- */
export const shareUpdateSchema = z
  .object({
    title: titleSchema.optional(),
    isPublic: booleanSchema.optional(),
  })
  .strict()
  .refine(
    (data) =>
      typeof data.title !== "undefined" || typeof data.isPublic !== "undefined",
    {
      message:
        "更新項目がありません。タイトルまたは公開フラグのいずれかを指定してください。",
      path: [], // ルートにエラー表示
    }
  );

export type ShareUpdateInput = z.infer<typeof shareUpdateSchema>;

/* ----------------------------------------------------------------
 * 取得系：クエリ・パラメータ（将来拡張を見据え分割）
 *  - 詳細取得は id または slug で指定（どちらか必須）
 *  - 一覧取得は最小の形（ページング等は将来追加）
 * ---------------------------------------------------------------- */
export const shareDetailQuerySchema = z
  .object({
    id: idSchema.optional(),
    slug: slugSchema.optional(),
  })
  .strict()
  .refine((q) => !!q.id || !!q.slug, {
    message: "id または slug のいずれかを指定してください。",
  });

export type ShareDetailQuery = z.infer<typeof shareDetailQuerySchema>;

export const shareListQuerySchema = z
  .object({
    // 将来 page, limit, q, sort 等を追加予定
  })
  .strict();

export type ShareListQuery = z.infer<typeof shareListQuerySchema>;

/* ----------------------------------------------------------------
 * API I/O 例（最低限の出力契約）
 *  - 実装側での共通利用を想定して型だけ提供
 * ---------------------------------------------------------------- */
export const shareListResponseSchema = z
  .object({
    items: z.array(shareSchema),
  })
  .strict();

export type ShareListResponse = z.infer<typeof shareListResponseSchema>;

export const shareDetailResponseSchema = shareSchema;
export type ShareDetailResponse = z.infer<typeof shareDetailResponseSchema>;

export const shareCreateResponseSchema = shareSchema;
export type ShareCreateResponse = z.infer<typeof shareCreateResponseSchema>;

export const shareUpdateResponseSchema = shareSchema;
export type ShareUpdateResponse = z.infer<typeof shareUpdateResponseSchema>;
