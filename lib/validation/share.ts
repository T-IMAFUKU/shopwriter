// lib/validation/share.ts
// 目的：まず運用を通す（落ちないAPI）。DBに不完全データが混じっていても500で落ちない暫定契約。
// 後でDBを整えたら、optionalを外して厳格化に戻します。

import { z } from "zod";

/** 共有ID（当面は最低1文字で許容。後で>=10へ戻す） */
export const ShareId = z.string().min(1);

/** 一覧クエリ（?limit=&before=） */
export const ListSharesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  before: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().optional()
  ),
});
export type ListSharesQuery = z.infer<typeof ListSharesQuery>;

/** Share本体（title/content は一時的に optional） */
export const Share = z.object({
  id: ShareId,
  userId: z.string().optional(),          // ← 一時的にoptional（DB揺れ対策）
  title: z.string().min(1).optional(),    // ← 一時的にoptional
  content: z.string().optional(),         // ← 一時的にoptional
  isPublic: z.boolean().default(false),
  // Date | string | null/undefined を ISO 文字列へ正規化
  createdAt: z
    .union([z.string(), z.date()])
    .transform((v) => (v instanceof Date ? v.toISOString() : v)),
});
export type Share = z.infer<typeof Share>;

/** 一覧レスポンス（契約） */
export const ShareListResponse = z.object({
  items: z.array(Share),
  next: z.string().nullable().optional(),
});
export type ShareListResponse = z.infer<typeof ShareListResponse>;

/** エラーフォーマット */
export const ApiError = z.object({ error: z.string() });
export type ApiError = z.infer<typeof ApiError>;
