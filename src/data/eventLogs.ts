// src/data/eventLogs.ts
import "server-only";
import { prisma } from "../lib/prisma";

/**
 * EventLog を取得するサーバサイド関数
 * - 最新順で最大100件
 */
export async function getEventLogs(limit = 100) {
  const logs = await prisma.eventLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return logs;
}

/**
 * イベント件数を日単位で集計（グラフ用）
 * - Postgres: DATE("createdAt") で日付単位に丸め
 */
export async function getEventLogCounts() {
  const rows = await prisma.$queryRaw<
    { date: string; count: number }[]
  >`
    SELECT
      DATE("createdAt")::text AS date,
      COUNT(*)::int AS count
    FROM "EventLog"
    GROUP BY DATE("createdAt")
    ORDER BY DATE("createdAt") ASC
  `;
  return rows;
}

export type EventLogRow = Awaited<ReturnType<typeof getEventLogs>>[number];
export type EventLogCountRow = Awaited<ReturnType<typeof getEventLogCounts>>[number];
