"use client";
export const dynamic = "force-dynamic";

import * as React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import EventLogTable from "@/components/dashboard/EventLogTable";
import { type EventLog } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Page() {
  // チャート用ダミーデータ（過去7日）
  const chartData = React.useMemo(
    () =>
      Array.from({ length: 7 }).map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return { date: `${y}-${m}-${day}`, count: Math.floor(Math.random() * 10) + 1 };
      }),
    []
  );

  // テーブル用（空配列で空状態メッセージを確認）
  const logs = [] as unknown as EventLog[];

  return (
    <main className="container mx-auto py-8 space-y-8">
      {/* Header */}
      <section className="space-y-2">
        <h1 className="text-xl font-semibold">UI Tokens Demo</h1>
        <p className="text-sm text-muted-foreground">
          グラフ・ボタン・テーブル・メニューの見た目をトークン基準で確認します。
        </p>
      </section>

      {/* Chart（Card化・軸ミニマル・グリッド淡化・可変バー幅） */}
      <section className="space-y-3">
        <Card className="overflow-hidden rounded-xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-medium">EventLogChart（Bar）</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="h-64" role="img" aria-label="EventLog の棒グラフ（過去7日）">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 8, right: 24, bottom: 8, left: 0 }}
                  barCategoryGap={20}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--muted-foreground))"
                    opacity={0.15}
                  />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    wrapperStyle={{ outline: "none" }}
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--popover))",
                      color: "hsl(var(--popover-foreground))",
                      padding: "8px 10px",
                    }}
                  />
                  <Bar
                    dataKey="count"
                    maxBarSize={32}
                    fill="hsl(var(--primary))"
                    fillOpacity={0.85}
                    radius={[8, 8, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Table（Card化） */}
      <section className="space-y-3">
        <Card className="overflow-hidden rounded-xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-medium">EventLogTable</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <EventLogTable logs={logs} />
          </CardContent>
        </Card>
      </section>

      {/* Controls：ボタンの詰まり解消＋字間微調整 */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">UI Controls</h2>
        <div className="flex items-center gap-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                className="px-5 py-2.5 leading-[1.15] whitespace-nowrap tracking-wide"
              >
                Dropdown を開く
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>メニュー</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>アクション 1</DropdownMenuItem>
              <DropdownMenuItem>アクション 2</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Dialog>
            <DialogTrigger asChild>
              <Button className="px-5 py-2.5 leading-[1.15] whitespace-nowrap tracking-wide">
                Dialog を開く
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-xl">
              <DialogHeader>
                <DialogTitle>ダイアログ見出し</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                余白・行間の調整により、文言が詰まって見えないことを確認します。
              </p>
            </DialogContent>
          </Dialog>
        </div>
      </section>
    </main>
  );
}

