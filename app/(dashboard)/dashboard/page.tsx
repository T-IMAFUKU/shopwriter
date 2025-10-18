/**
 * Dashboard Page
 * - UIトークン（radius / shadow / spacing）適用
 * - Range/Level のフィルタを Card + Button(asChild<Link>) で統一
 * - 既存ロジックは保持（動的：force-dynamic）
 */

export const dynamic = "force-dynamic";

import * as React from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// 可視化（既存Step E）
import EventLogChart from "@/components/dashboard/EventLogChart";
import EventLogTable from "@/components/dashboard/EventLogTable";

// range（7/14/30日）
type RangeKey = "7d" | "14d" | "30d";
const RANGE_TO_DAYS: Record<RangeKey, number> = { "7d": 7, "14d": 14, "30d": 30 };
const RANGE_KEYS: readonly RangeKey[] = ["7d", "14d", "30d"] as const;

// level（フィルタ）
type LevelKey = "all" | "info" | "warn" | "error";
const LEVEL_KEYS: readonly LevelKey[] = ["all", "info", "warn", "error"] as const;

function buildQuery(range: RangeKey, level: LevelKey) {
  const q = new URLSearchParams();
  q.set("range", range);
  q.set("level", level);
  return `?${q.toString()}`;
}

export default function DashboardPage({
  searchParams,
}: {
  searchParams?: { range?: string; level?: string };
}) {
  // range（デフォルト 14d）
  const rawRange = (searchParams?.range ?? "14d").toLowerCase();
  const rangeKey: RangeKey = (RANGE_KEYS as readonly string[]).includes(rawRange)
    ? (rawRange as RangeKey)
    : "14d";
  const days = RANGE_TO_DAYS[rangeKey];

  // level（デフォルト all）
  const rawLevel = (searchParams?.level ?? "all").toLowerCase();
  const level: LevelKey = (LEVEL_KEYS as readonly string[]).includes(rawLevel)
    ? (rawLevel as LevelKey)
    : "all";

  return (
    <main className="mx-auto max-w-7xl px-8 md:px-12 py-6 md:py-8 space-y-8">
      {/* ヘッダー */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] md:text-[26px] font-semibold tracking-tight">
            ダッシュボード
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            期間: {days}日 / レベル: {level.toUpperCase()}
          </p>
        </div>
        {/* フィルタ（Range / Level） */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Range */}
          <div className="inline-flex items-center gap-1">
            {RANGE_KEYS.map((rk) => {
              const active = rk === rangeKey;
              return (
                <Button
                  key={rk}
                  asChild
                  variant={active ? "primary" : "secondary"}
                  size="sm"
                >
                  <Link href={buildQuery(rk, level)} aria-current={active ? "page" : undefined}>
                    {rk.toUpperCase()}
                  </Link>
                </Button>
              );
            })}
          </div>
          <span className="text-muted-foreground text-xs px-1">/</span>
          {/* Level */}
          <div className="inline-flex items-center gap-1">
            {LEVEL_KEYS.map((lv) => {
              const active = lv === level;
              return (
                <Button
                  key={lv}
                  asChild
                  variant={active ? "primary" : "secondary"}
                  size="sm"
                >
                  <Link href={buildQuery(rangeKey, lv)} aria-current={active ? "page" : undefined}>
                    {lv.toUpperCase()}
                  </Link>
                </Button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Chart */}
      <Card className="p-0">
        <CardHeader className="p-5 md:p-6 pb-2">
          <CardTitle className="text-sm">イベント推移</CardTitle>
        </CardHeader>
        <CardContent className="p-5 md:p-6 pt-0">
          <section className="space-y-4" aria-label="eventlog-chart">
            <EventLogChart key={`chart-${days}`} days={days} />
          </section>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="p-0">
        <CardHeader className="p-5 md:p-6 pb-2">
          <CardTitle className="text-sm">イベント一覧</CardTitle>
        </CardHeader>
        <CardContent className="p-5 md:p-6 pt-0">
          <section className="space-y-4" aria-label="eventlog-table">
            <EventLogTable key={`table-${days}-${level}`} days={days} level={level} />
          </section>
        </CardContent>
      </Card>
    </main>
  );
}
