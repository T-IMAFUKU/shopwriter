// app/(dashboard)/dashboard/page.tsx
import { unstable_noStore as noStore } from "next/cache";
import prisma from "@/lib/prisma";
import EventLogTable from "@/components/dashboard/EventLogTable";
import EventLogChart, { type EventLogChartPoint } from "@/components/dashboard/EventLogChart";
import { type EventLog } from "@prisma/client";

/**
 * Dashboard（最小構成）
 * - サーバーコンポーネント
 * - fail-silent：取得失敗→空配列で安全に描画（トースト等は出さない）
 * - 表：直近10件
 * - グラフ：過去14日（ローカルタイムの 00:00 基準、欠損0補完）
 */

export default async function DashboardPage() {
  noStore();

  const [latest10, chart14] = await Promise.all([
    getLatest10().catch(() => [] as EventLog[]),
    getChart14Days().catch(() => [] as EventLogChartPoint[]),
  ]);

  return (
    <main className="container mx-auto p-6 space-y-6">
      {/* Chart Card */}
      <section
        className="border bg-background/60 backdrop-blur"
        style={{ borderRadius: "var(--ui-radius-2xl)", padding: "var(--spacing-4)" }}
      >
        <h2 className="text-lg font-semibold">イベント推移（直近14日）</h2>
        <div className="mt-4">
          <EventLogChart data={chart14} variant="bar" height={260} />
        </div>
      </section>

      {/* Table Card */}
      <section
        className="border bg-background/60 backdrop-blur"
        style={{ borderRadius: "var(--ui-radius-2xl)", padding: "var(--spacing-4)" }}
      >
        <h2 className="text-lg font-semibold">イベント一覧（最新10件）</h2>
        <div className="mt-4">
          <EventLogTable logs={latest10} />
        </div>
      </section>
    </main>
  );
}

/** 最新10件（降順） */
async function getLatest10(): Promise<EventLog[]> {
  return prisma.eventLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
  });
}

/** 過去14日をローカル日付で集計し、欠損日は0で補完 */
async function getChart14Days(): Promise<EventLogChartPoint[]> {
  const buckets = makeLastNDaysLocal(14); // 例: ["2025-10-01", ... , "2025-10-14"]
  const startLocal = new Date(`${buckets[0]}T00:00:00`); // ローカル 00:00 起点

  // 期間内の作成日時だけ取得
  const rows = await prisma.eventLog.findMany({
    where: { createdAt: { gte: startLocal } },
    select: { createdAt: true },
  });

  // ローカル日付キーでカウント
  const counter = new Map<string, number>();
  for (const d of buckets) counter.set(d, 0);

  for (const r of rows) {
    const key = toLocalYMD(new Date(r.createdAt));
    if (counter.has(key)) counter.set(key, (counter.get(key) ?? 0) + 1);
  }

  return buckets.map((d) => ({ date: d, count: counter.get(d) ?? 0 }));
}

/** 今日を含む直近N日（ローカルタイム）の YYYY-MM-DD 配列（古い→新しい） */
function makeLastNDaysLocal(n: number): string[] {
  const msPerDay = 24 * 60 * 60 * 1000;
  const base = new Date();
  base.setHours(0, 0, 0, 0); // ローカル 00:00

  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base.getTime() - i * msPerDay);
    out.push(toLocalYMD(d));
  }
  return out;
}

/** Date → ローカルの YYYY-MM-DD（ゼロ埋め） */
function toLocalYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
