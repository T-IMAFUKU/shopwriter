// app/(dashboard)/dashboard/page.tsx
// Server Component
import * as React from "react";

// Step E の実体に合わせて default import
import EventLogChart from "@/components/dashboard/EventLogChart";
import EventLogTable from "@/components/dashboard/EventLogTable";

type RangeKey = "7d" | "14d" | "30d";
const RANGE_TO_DAYS: Record<RangeKey, number> = { "7d": 7, "14d": 14, "30d": 30 };

export default function DashboardPage({
  searchParams,
}: {
  searchParams?: { range?: string };
}) {
  const rangeKey = (searchParams?.range?.toLowerCase() as RangeKey) ?? "14d";
  const days = RANGE_TO_DAYS[rangeKey] ?? 14;

  return (
    <>
      {/* 一時回避：型は any として days を受け渡し（後続 G-2c で正式型に） */}
      <EventLogChart key={`chart-${days}`} {...({ days } as any)} />
      <EventLogTable key={`table-${days}`} {...({ days } as any)} />
    </>
  );
}