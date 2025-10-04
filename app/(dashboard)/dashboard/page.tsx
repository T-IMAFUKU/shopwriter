// app/(dashboard)/dashboard/page.tsx
// Server Component
import * as React from "react";

// default import（Step E 実装に合わせる）
import EventLogChart from "@/components/dashboard/EventLogChart";
import EventLogTable from "@/components/dashboard/EventLogTable";

// range（7/14/30日）
type RangeKey = "7d" | "14d" | "30d";
const RANGE_TO_DAYS: Record<RangeKey, number> = { "7d": 7, "14d": 14, "30d": 30 };
const RANGE_KEYS: readonly RangeKey[] = ["7d", "14d", "30d"] as const;

// level（フィルタ）
type LevelKey = "all" | "info" | "warn" | "error";
const LEVEL_KEYS: readonly LevelKey[] = ["all", "info", "warn", "error"] as const;

export default function DashboardPage({
  searchParams,
}: {
  searchParams?: { range?: string; level?: string };
}) {
  // range 取得（デフォルト 14d）
  const rawRange = (searchParams?.range ?? "14d").toLowerCase();
  const rangeKey: RangeKey = (RANGE_KEYS as readonly string[]).includes(rawRange)
    ? (rawRange as RangeKey)
    : "14d";
  const days = RANGE_TO_DAYS[rangeKey];

  // level 取得（デフォルト all）
  const rawLevel = (searchParams?.level ?? "all").toLowerCase();
  const level: LevelKey = (LEVEL_KEYS as readonly string[]).includes(rawLevel)
    ? (rawLevel as LevelKey)
    : "all";

  return (
    <>
      {/* Chart：range のみ連動 */}
      <EventLogChart key={`chart-${days}`} days={days} />

      {/* Table：range + level を連動（厳格型・as any 撤去） */}
      <EventLogTable key={`table-${days}-${level}`} days={days} level={level} />
    </>
  );
}