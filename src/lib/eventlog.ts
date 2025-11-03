/**
 * EventLog ユーティリティ（統合版）
 * - Zodで入力検証
 * - Prisma EventLog へ書き込み
 * - Better Stack(Logtail) へHTTP送信（LOGTAIL_SOURCE_TOKEN がある時だけ）
 * - どちらも best-effort（失敗してもアプリを止めない）
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
  /** DB/外部送信ともに「投げっぱなし」モード */
  fireAndForget?: boolean;
  /** 失敗時に console.warn を出さない */
  silentOnError?: boolean;
};

// ---------- Better Stack (Logtail) 送信 ----------

type LogtailLevel = "debug" | "info" | "warn" | "error";

const LOGTAIL_ENDPOINT =
  process.env.LOGTAIL_ENDPOINT?.trim() || "https://in.logs.betterstack.com";

function levelToLogtail(l: EventLevel): LogtailLevel {
  switch (l) {
    case "ERROR":
      return "error";
    case "WARN":
      return "warn";
    default:
      return "info";
  }
}

function resolveLogtailToken(): string | null {
  const t = process.env.LOGTAIL_SOURCE_TOKEN;
  if (!t || !t.trim()) return null;
  return t.trim();
}

async function postToLogtail(
  parsed: EventLogInput,
  extras?: Record<string, unknown>
) {
  const token = resolveLogtailToken();
  if (!token) return;

  const ac = typeof AbortController !== "undefined" ? new AbortController() : undefined;
  const timer = ac ? setTimeout(() => ac.abort(), 2500) : null; // 2.5s タイムアウト

  try {
    const body = {
      app: "shopwriter",
      message: parsed.event,
      level: levelToLogtail(parsed.level ?? "INFO"),
      route: parsed.url ?? undefined,
      ts: new Date().toISOString(),
      env: process.env.NODE_ENV,
      // 解析しやすいよう元フィールドも併記
      userId: parsed.userId ?? undefined,
      sessionId: parsed.sessionId ?? undefined,
      category: parsed.category ?? undefined,
      refType: parsed.refType ?? undefined,
      refId: parsed.refId ?? undefined,
      durationMs: parsed.durationMs ?? undefined,
      ip: parsed.ip ?? undefined,
      userAgent: parsed.userAgent ?? undefined,
      payload: parsed.payload,
      context: parsed.context,
      ...extras,
    };

    await fetch(LOGTAIL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: ac?.signal,
    });
  } catch {
    // best-effort: 失敗は握りつぶす
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ---------- メイン：DB + Logtail ----------

export async function logEvent(input: EventLogInput, opts: LogEventOptions = {}) {
  const { fireAndForget = false, silentOnError = true } = opts;
  const parsed = EventLogInput.parse(input);

  // Prisma へ投入するデータ
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

  if (fireAndForget) {
    // DBとLogtailを並列で「投げっぱなし」
    prisma.eventLog.create({ data }).catch((e: unknown) => {
      if (!silentOnError) console.warn("[logEvent] fire-and-forget(DB) failed:", e);
    });
    postToLogtail(parsed).catch(() => {});
    return { ok: true as const, id: undefined };
  }

  try {
    const created = await prisma.eventLog.create({ data });
    // DB成功・失敗にかかわらず Logtail はベストエフォートで投げる
    postToLogtail(parsed, { dbId: created?.id }).catch(() => {});
    return { ok: true as const, id: created.id };
  } catch (e: unknown) {
    if (!silentOnError) console.warn("[logEvent] DB failed:", e);
    // DB失敗でも Logtail だけは試す（原因観測のため）
    postToLogtail(parsed, { dbWrite: "failed" }).catch(() => {});
    return { ok: false as const, error: "failed_to_log_event" };
  }
}

// ---------- ショートハンド ----------

export async function logInfo(event: string, extra?: Partial<EventLogInput>) {
  return logEvent({ event, level: "INFO", ...extra }, { fireAndForget: true });
}

export async function logWarn(event: string, extra?: Partial<EventLogInput>) {
  return logEvent({ event, level: "WARN", ...extra }, { fireAndForget: true });
}

export async function logError(event: string, extra?: Partial<EventLogInput>) {
  return logEvent({ event, level: "ERROR", ...extra }, { fireAndForget: true });
}
