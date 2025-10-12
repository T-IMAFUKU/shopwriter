// src/components/dashboard/EventLogChart.tsx
"use client";

import * as React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export type EventLogChartPoint = {
  date: string; // "YYYY-MM-DD"（ローカル日付）
  count: number;
};

type Props = {
  data: EventLogChartPoint[];
  height?: number;
  variant?: "bar";
};

export default function EventLogChart({
  data,
  height = 260,
  variant = "bar",
}: Props) {
  // 空でも 14 本 0 データでフェイルセーフ（page.tsx 側も補完しているが二重安全）
  const safeData = React.useMemo<EventLogChartPoint[]>(() => {
    if (Array.isArray(data) && data.length > 0) return data;
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    const out: EventLogChartPoint[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(base.getTime() - i * 24 * 60 * 60 * 1000);
      out.push({ date: toLocalYMD(d), count: 0 });
    }
    return out;
  }, [data]);

  return (
    <div
      className="border bg-background"
      style={{
        borderRadius: "var(--ui-radius-xl)",
        padding: "var(--spacing-3)",
      }}
    >
      {variant === "bar" ? (
        <div style={{ width: "100%", height }}>
          <ResponsiveContainer>
            <BarChart data={safeData} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.35} />
              <XAxis
                dataKey="date"
                tickFormatter={(v: string) => formatToMd(v)}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={8}
                fontSize={12}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={28}
                fontSize={12}
              />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="count" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </div>
  );
}

/** "YYYY-MM-DD" → "M/D"（substring で安全に整形） */
function formatToMd(iso: string): string {
  if (typeof iso !== "string" || iso.length < 10) return "";
  const mm = iso.substring(5, 7);
  const dd = iso.substring(8, 10);
  const m = mm.startsWith("0") ? mm.slice(1) : mm;
  const d = dd.startsWith("0") ? dd.slice(1) : dd;
  return `${m}/${d}`;
}

/** Date → ローカル "YYYY-MM-DD" */
function toLocalYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** ツールチップ（M/D + 件数） */
function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string | number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const val = payload[0]?.value ?? 0;
  const md = typeof label === "string" ? formatToMd(label) : "";
  return (
    <div
      className="border bg-popover text-popover-foreground shadow-sm"
      style={{
        borderRadius: "var(--ui-radius-md)",
        padding: "var(--spacing-2)",
      }}
    >
      <div style={{ fontSize: "0.8rem", opacity: 0.8 }}>{md}</div>
      <div style={{ fontWeight: 600 }}>{val} 件</div>
    </div>
  );
}
