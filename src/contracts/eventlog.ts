import { z } from "zod";

export const VER_LABEL_EVENTLOG = "eventlog";

export const EventLogSchema = z.object({
  category: z.string().min(1),                // 例: "ui"
  event: z.string().min(1),                   // 例: "template.select"
  level: z.enum(["INFO", "WARN", "ERROR"]),   // DoDで使用: "INFO"
  payload: z.record(z.any()).optional().default({}),
});

export type EventLogInput = z.infer<typeof EventLogSchema>;

/** POST /api/eventlog の成功レスポンス */
export const EventLogResponseSchema = z.object({
  ok: z.literal(true),
  ver: z.string(),
  data: z.object({
    id: z.string(),
  }),
});
export type EventLogResponse = z.infer<typeof EventLogResponseSchema>;

/** 共通エラーフォーマット */
export const ApiErrorSchema = z.object({
  ok: z.literal(false),
  ver: z.string(),
  error: z.object({
    message: z.string(),
  }).passthrough(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
