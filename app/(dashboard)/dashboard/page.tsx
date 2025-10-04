// app/(dashboard)/dashboard/page.tsx
// Server Component
import * as React from "react";

// Step E で作成済みの実体に合わせて default import
import EventLogChart from "@/components/dashboard/EventLogChart";
import EventLogTable from "@/components/dashboard/EventLogTable";

type RangeKey = "7d" | "14d" | "30d";
const RANGE_TO_DAYS: Record<RangeKey, number> = { "7d": 7, "14d": 14, "30d": 30 };
const RANGE_KEYS: readonly RangeKey[] = ["7d", "14d", "30d"];

export default function DashboardPage({
  searchParams,
}: {
  searchParams?: { range?: string };
}) {
  const raw = (searchParams?.range ?? "14d").toLowerCase();
  const rangeKey: RangeKey = (RANGE_KEYS as readonly string[]).includes(raw) ? (raw as RangeKey) : "14d";
  const days = RANGE_TO_DAYS[rangeKey];

  return (
    <>
      <EventLogChart key={`chart-${days}`} days={days} />
      <EventLogTable key={`table-${days}`} days={days} />
    </>
  );
}