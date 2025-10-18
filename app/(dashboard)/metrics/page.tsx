// app/(dashboard)/metrics/page.tsx
import { getEventLogs, getEventLogCounts } from "../../../src/data/eventLogs";
import EventLogTable from "../../../src/components/dashboard/EventLogTable";
import EventLogChart from "../../../src/components/dashboard/EventLogChart";

export const dynamic = "force-dynamic"; // 最新ログを毎回取得

export default async function MetricsPage() {
  const [logs, counts] = await Promise.all([
    getEventLogs(100),
    getEventLogCounts(),
  ]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* グラフブロック */}
      <section className="rounded-lg border">
        <header className="px-4 py-3 border-b">
          <h2 className="text-base font-semibold">EventLog — 日次件数</h2>
        </header>
        <div className="p-4">
          <EventLogChart data={counts} />
        </div>
      </section>

      {/* テーブルブロック */}
      <section className="rounded-lg border">
        <header className="px-4 py-3 border-b">
          <h2 className="text-base font-semibold">EventLog — 最新100件</h2>
        </header>
        <div className="p-4">
          <EventLogTable logs={logs} />
        </div>
      </section>
    </div>
  );
}

