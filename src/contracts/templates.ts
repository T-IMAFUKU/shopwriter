import { z } from "zod";

/** バージョン文字列（任意） */
export const VER_LABEL_TEMPLATES = "templates";

/** 一覧の各アイテム（APIレスポンス上はISO日時文字列） */
export const TemplateListItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

/** GET /api/templates の成功レスポンス */
export const TemplateListResponseSchema = z.object({
  ok: z.literal(true),
  ver: z.string(),
  data: z.array(TemplateListItemSchema),
});
export type TemplateListResponse = z.infer<typeof TemplateListResponseSchema>;

/** POST /api/templates のリクエストボディ */
export const TemplateCreateRequestSchema = z.object({
  title: z.string().min(1, "title is required"),
  body: z.string().min(1, "body is required"),
});
export type TemplateCreateRequest = z.infer<typeof TemplateCreateRequestSchema>;

/** 共通エラーフォーマット（kind/messageは必須。その他はpassthrough） */
export const ApiErrorSchema = z.object({
  ok: z.literal(false),
  ver: z.string(),
  error: z
    .object({
      kind: z.string(),
      message: z.string(),
    })
    .passthrough(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
