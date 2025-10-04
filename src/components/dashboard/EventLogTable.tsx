// src/components/dashboard/EventLogTable.tsx
import { type EventLog, EventLevel } from "@prisma/client";

/**
 * EventLog を一覧表示するテーブル（サーバコンポーネント）
 * - 純HTMLテーブル + Tailwind（shadcn/ui 依存なし）
 * - 表示カラム：日時 / レベル / カテゴリ / イベント / URL / 参照 / ユーザー / セッション / ペイロード
 */
export default function EventLogTable({ logs }: { logs: EventLog[] }) {
  if (!logs?.length) {
    return (
      <div
        className="text-sm text-muted-foreground border"
        style={{
          padding: "var(--spacing-4)",
          borderRadius: "var(--ui-radius-lg)",
        }}
      >
        EventLog はまだありません。
      </div>
    );
  }

  return (
    <div
      className="border overflow-x-auto"
      style={{ borderRadius: "var(--ui-radius-lg)" }}
    >
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left">
          <tr>
            <th style={{ padding: "var(--spacing-2) var(--spacing-3)" }}>日時</th>
            <th style={{ padding: "var(--spacing-2) var(--spacing-3)" }}>Lv</th>
            <th style={{ padding: "var(--spacing-2) var(--spacing-3)" }}>カテゴリ</th>
            <th style={{ padding: "var(--spacing-2) var(--spacing-3)" }}>イベント</th>
            <th style={{ padding: "var(--spacing-2) var(--spacing-3)" }}>URL</th>
            <th style={{ padding: "var(--spacing-2) var(--spacing-3)" }}>参照</th>
            <th style={{ padding: "var(--spacing-2) var(--spacing-3)" }}>ユーザー</th>
            <th style={{ padding: "var(--spacing-2) var(--spacing-3)" }}>セッション</th>
            <th style={{ padding: "var(--spacing-2) var(--spacing-3)" }}>ペイロード</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {logs.map((row) => (
            <tr key={row.id} className="align-top">
              <td className="whitespace-nowrap" style={{ padding: "var(--spacing-2) var(--spacing-3)" }}>
                {formatJST(row.createdAt)}
              </td>
              <td className="whitespace-nowrap" style={{ padding: "var(--spacing-2) var(--spacing-3)" }}>
                <LevelBadge level={row.level} />
              </td>
              <td className="whitespace-nowrap" style={{ padding: "var(--spacing-2) var(--spacing-3)" }}>
                {row.category ?? "-"}
              </td>
              <td className="whitespace-nowrap font-medium" style={{ padding: "var(--spacing-2) var(--spacing-3)" }}>
                {row.event}
              </td>
              <td className="whitespace-nowrap" style={{ padding: "var(--spacing-2) var(--spacing-3)" }}>
                {row.url ?? "-"}
              </td>
              <td className="whitespace-nowrap" style={{ padding: "var(--spacing-2) var(--spacing-3)" }}>
                {row.refType ? `${row.refType}${row.refId ? `:${row.refId}` : ""}` : "-"}
              </td>
              <td className="whitespace-nowrap" style={{ padding: "var(--spacing-2) var(--spacing-3)" }}>
                {row.userId ?? "-"}
              </td>
              <td className="whitespace-nowrap" style={{ padding: "var(--spacing-2) var(--spacing-3)" }}>
                {row.sessionId ?? "-"}
              </td>
              <td style={{ padding: "var(--spacing-2) var(--spacing-3)" }}>
                <code className="text-xs">{shortJson(row.payload) ?? "-"}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LevelBadge({ level }: { level: EventLevel }) {
  const styles =
    level === "ERROR"
      ? "bg-destructive/15 text-destructive border-destructive/30"
      : level === "WARN"
      ? "bg-amber-500/15 text-amber-700 border-amber-500/30"
      : "bg-muted text-foreground/80 border-border";

  return (
    <span
      className={`inline-flex items-center border text-xs ${styles}`}
      style={{
        borderRadius: "var(--ui-radius-md)",
        padding: "0 var(--spacing-2)",
        lineHeight: "var(--spacing-4)",
      }}
    >
      {level}
    </span>
  );
}

function shortJson(data: unknown, max = 80): string | null {
  if (!data) return null;
  try {
    const s = JSON.stringify(data);
    return s.length > max ? s.slice(0, max - 1) + "…" : s;
  } catch {
    return String(data);
  }
}

function formatJST(date: Date) {
  const d = new Date(date);
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(d)
    .replaceAll("/", "-");
}
