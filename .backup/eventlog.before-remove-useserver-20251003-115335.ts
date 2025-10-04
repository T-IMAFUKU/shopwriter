/**
 * EventLog ユーティリティ
 * - Zodで入力を検証
 * - 既存の Prisma モデル EventLog に書き込み
 * - UX優先の best-effort（失敗しても本処理は止めない）
 */

"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";

/** Prisma側のenumに合わせる */
export const EventLevel = z.enum(["INFO", "WARN", "ERROR"]);
export type EventLevel = z.infer<typeof EventLevel>;

/** 受け取る入力（PrismaのEventLogに準拠） */
export const EventLogInput = z.object({
  // who
  userId: z.string().min(1).optional().nullable(),
  sessionId: z.string().min(1).optional().nullable(),

  // what
  category: z.string().min(1).optional().nullable(), // 文字列のまま（将来enum化可）
  event: z.string().min(1, "event は必須です"),
  level: EventLevel.default("INFO"),

  // where
  url: z.string().min(1).optional().nullable(),
  refType: z.string().min(1).optional().nullable(),
  refId: z.string().min(1).optional().nullable(),

  // metrics / data
  durationMs: z.number().int().nonnegative().optional(),
  payload: z.any().optional(),
  context: z.any().optional(),

  // device info（PII配慮。必要時のみ）
  ip: z.string().min(1).optional().nullable(),
  userAgent: z.string().min(1).optional().nullable(),
});
export type EventLogInput = z.infer<typeof EventLogInput>;

export type LogEventOptions = {
  /** true にすると fire-and-forget（await しない） */
  fireAndForget?: boolean;
  /** ローカル開発時のみ静かに失敗させたい場合 false（既定:true） */
  silentOnError?: boolean;
};

/**
 * 使い方:
 *   await logEvent({ event: "template.select", category: "ui", userId }, { fireAndForget: true })
 */
export async function logEvent(input: EventLogInput, opts: LogEventOptions = {}) {
  const { fireAndForget = false, silentOnError = true } = opts;
  const parsed = EventLogInput.parse(input);

  // Prisma データ組み立て（undefined は除外）
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
      // 失敗しても本処理は止めない（握りつぶし）
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      prisma.eventLog.create({ data }).catch((e) => {
        if (!silentOnError) {
          console.warn("[logEvent] fire-and-forget failed:", e);
        }
      });
      return { ok: true as const, id: undefined };
    }

    const created = await prisma.eventLog.create({ data });
    return { ok: true as const, id: created.id };
  } catch (e) {
    if (!silentOnError) {
      console.warn("[logEvent] failed:", e);
    }
    // 失敗してもアプリの本処理は妨げない
    return { ok: false as const, error: "failed_to_log_event" };
  }
}

/** 型安全なヘルパー（レベルごとのショートハンド） */
export const EventLogger = {
  info: (event: string, partial?: Omit<EventLogInput, "event" | "level">, opts?: LogEventOptions) =>
    logEvent({ level: "INFO", event, ...partial }, opts),
  warn: (event: string, partial?: Omit<EventLogInput, "event" | "level">, opts?: LogEventOptions) =>
    logEvent({ level: "WARN", event, ...partial }, opts),
  error: (event: string, partial?: Omit<EventLogInput, "event" | "level">, opts?: LogEventOptions) =>
    logEvent({ level: "ERROR", event, ...partial }, opts),
};
