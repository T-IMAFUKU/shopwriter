// types/dashboard-eventlog.d.ts
declare module "@/components/dashboard/EventLogChart" {
  import * as React from "react";

  /**
   * グラフ1点の型：
   * - デモでは { date, count } を使用
   * - 本番の内部実装では { date, value } を使う可能性あり
   * → 両方に対応できるよう両方 optional にして互換化
   */
  export type EventLogChartPoint = {
    /** 日付（Date でも ISO 文字列でも可） */
    date: Date | string;
    /** 件数（demo 互換） */
    count?: number;
    /** 値（本番互換） */
    value?: number;
    /** 任意の追加情報（ツールチップ等で使用可） */
    [key: string]: unknown;
  };

  /** コンポーネントが受け取れる props（既存＋デモ要求を包含） */
  export interface EventLogChartProps extends React.ComponentPropsWithoutRef<"div"> {
    /** 直近日数（例: 7/14/30）。未指定時は実装側のデフォルト */
    days?: number;
    /** 直接データを与える場合（デモページなど） */
    data?: EventLogChartPoint[];
    /** 表示バリアント（例: "bar" | "line" など） */
    variant?: string;
    /** 図の高さ（px） */
    height?: number;
  }

  const EventLogChart: React.ComponentType<EventLogChartProps>;
  export default EventLogChart;
}