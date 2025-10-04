// types/dashboard-eventlog-table.d.ts
declare module "@/components/dashboard/EventLogTable" {
  import * as React from "react";

  /** テーブル1行の任意データ（実装差異に耐えるため緩めに定義） */
  export type EventLogRow = Record<string, unknown>;

  /** 列定義（必要最低限） */
  export interface EventLogColumn {
    key: string;
    header?: React.ReactNode;
    width?: number | string;
    render?: (row: EventLogRow) => React.ReactNode;
    [key: string]: unknown;
  }

  /** コンポーネントが受け取れる props（本番・デモの要求を包含） */
  export interface EventLogTableProps extends React.ComponentPropsWithoutRef<"div"> {
    /** 直近日数（例: 7/14/30）。未指定時は実装側のデフォルト */
    days?: number;

    /** レベルフィルタ（URL ?level= と連動） */
    level?: "all" | "info" | "warn" | "error";

    /** デモや検証で使う任意データ（UI トークンデモ互換） */
    data?: EventLogRow[];

    /** デモページ互換：`<EventLogTable logs={...} />` を許容 */
    logs?: EventLogRow[];

    /** 列カスタマイズ（任意） */
    columns?: EventLogColumn[];

    /** 1ページの行数（任意） */
    pageSize?: number;

    /** 行クリックなどのハンドラ（任意） */
    onRowClick?: (row: EventLogRow) => void;
  }

  const EventLogTable: React.ComponentType<EventLogTableProps>;
  export default EventLogTable;
}