// contracts/share.ts
import { z } from "zod";

/**
 * Share スキーマ（テスト完全対応版）
 */
export const shareCreateSchema = z.object({
  title: z.string().min(1, "title is required"),
  slug: z
    .string()
    .min(3, "slug must be at least 3 characters")
    .regex(/^[a-z0-9-]+$/, "slug must contain only lowercase letters, numbers, and hyphens"),
  isPublic: z.boolean().optional().default(true),
  content: z.string().optional(),
});

// list 用は「空オブジェクトのみ許可」→追加キーはすべてNG
export const shareListQuerySchema = z.object({}).strict();

export type ShareCreateInput = z.infer<typeof shareCreateSchema>;
export type ShareListQueryInput = z.infer<typeof shareListQuerySchema>;
