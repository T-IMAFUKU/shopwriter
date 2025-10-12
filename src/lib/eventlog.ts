/**
 * EventLog ユーティリティ
 * - Zodで入力を検証
 * - Prisma EventLog モデルへ書き込み
 * - UX優先の best-effort（失敗しても処理を止めない）
 */

import { z } from "zod";
import { prisma } from "@/lib/prisma";

/** Prisma側のenumに合わせる */
export const EventLevel = z.enum(["INFO", "WARN", "ERROR"]);
export type EventLevel = z.infer<typeof EventLevel>;

/** 受け取る入力（Prisma EventLogに準拠） */
export const EventLogInput = z.object({
  userId: z.string().min(1).optional().nullable(),
  sessionId: z.string().min(1).optional().nullable(),

  category: z.string().min(1).optional().nullable(),
  event: z.string().min(1, "event は必須です"),
  level: EventLevel.default("INFO"),

  url: z.string().min(1).optional().nullable(),
  refType: z.string().min(1).optional().nullable(),
  refId: z.string().min(1).optional().nullable(),

  durationMs: z.number().int().nonnegative().optional(),
  payload: z.any().optional(),
  context: z.any().optional(),

  ip: z.string().min(1).optional().nullable(),
  userAgent: z.string().min(1).optional().nullable(),
});
export type EventLogInput = z.infer<typeof EventLogInput>;

export type LogEventOptions = {
  fireAndForget?: boolean;
  silentOnError?: boolean;
};

/** メイン関数 */
export async function logEvent(input: EventLogInput, opts: LogEventOptions = {}) {
  const { fireAndForget = false, silentOnError = true } = opts;
  const parsed = EventLogInput.parse(input);

  const data = {
    userId: parsed.userId ?? null,
    sessionId: parsed.sessionId ?? null,
    category: parsed.category ?? null,
    event: parsed.event,
    level: parsed.level,
    url: parsed.url ?? null,
    refType: parsed.refType ?? null,
    refId: parsed.refId ?? null,
    durationMs: parsed.durationMs ?? null,
    payload: parsed.payload ?? null,
    context: parsed.context ?? null,
    ip: parsed.ip ?? null,
    userAgent: parsed.userAgent ?? null,
  } as const;

  try {
    if (fireAndForget) {
      prisma.eventLog.create({ data }).catch((e: unknown) => {
        if (!silentOnError) console.warn("[logEvent] fire-and-forget failed:", e);
      });
      return { ok: true as const, id: undefined };
    }

    const created = await prisma.eventLog.create({ data });
    return { ok: true as const, id: created.id };
  } catch (e: unknown) {
    if (!silentOnError) console.warn("[logEvent] failed:", e);
    return { ok: false as const, error: "failed_to_log_event" };
  }
}
