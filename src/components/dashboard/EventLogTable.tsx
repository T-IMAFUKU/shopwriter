// src/components/dashboard/EventLogTable.tsx
import * as React from "react";
import type { EventLog } from "@prisma/client";
import { cn } from "@/lib/utils";

/**
<<<<<<< HEAD
 * EventLog の最小テーブル
 * - 最大10行（page.tsx 側で take:10）
 * - 空データ時は「データがありません」
 * - ペイロードは横スクロール
 * - Badge 色は UIトークンのみ（INFO / WARN / ERROR）
 * - 型対応:
 *   - th/td はネイティブ属性(title 等)を許可
 *   - 「参照」列はスキーマ差異に耐える安全アクセサ（refType/referer/referrer/refId/ref など探査）
 */
=======
 * Prisma 型に依存しない軽量テーブル。
 * - 既存 UI は維持（列/スタイル/表示文言は同じ）
 * - Prisma の `EventLog` が存在しない環境でも typecheck/build を通す
 * - props は「必要フィールド＋拡張」を許容する疎結合型
 */
export type EventLogRow = {
  id: string | number;
  createdAt: Date | string;
  level?: string | null;
  category?: string | null;
  event?: string | null;
  url?: string | null;
  userId?: string | number | null;
  sessionId?: string | number | null;
  payload?: unknown;

  // 参照系：スキーマ差異に耐える（Prisma 由来の null を許容）
  referrer?: string | null;          // ★ null/undefined 許容
  referer?: string | null;           // ★ null/undefined 許容
  ref?: string | number | null;      // ★ null 許容
  refId?: string | number | null;    // ★ null 許容
  refType?: string | null;           // ★ null 許容

  // 任意の追加フィールド（将来拡張）
  [k: string]: unknown;
};
>>>>>>> ce9b8053 (test(writer): LP個別timeout 12s→30s / preload適用導線整備（H-8 LEVEL2 Green）)

type Props = {
  logs: EventLog[] | null | undefined;
};

export default function EventLogTable({ logs }: Props) {
  const rows = Array.isArray(logs) ? logs : [];

  if (rows.length === 0) {
    return (
      <div
        className="border bg-muted/40 text-muted-foreground"
        style={{
          borderRadius: "var(--ui-radius-xl)",
          padding: "var(--spacing-4)",
        }}
      >
        データがありません。
      </div>
    );
  }

  return (
    <div
      className="border bg-background"
      style={{
        borderRadius: "var(--ui-radius-xl)",
        padding: "var(--spacing-3)",
      }}
    >
      <div className="w-full overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-muted-foreground">
            <tr>
              <Th>日時</Th>
              <Th className="w-[80px]">Lv</Th>
              <Th className="min-w-[110px]">カテゴリ</Th>
              <Th className="min-w-[140px]">イベント</Th>
              <Th className="min-w-[120px]">URL</Th>
              <Th className="w-[120px]">参照</Th>
              <Th className="w-[110px]">ユーザー</Th>
              <Th className="w-[120px]">セッション</Th>
              <Th className="min-w-[360px]">ペイロード</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <Td className="whitespace-nowrap">{fmtDateTime(r.createdAt)}</Td>
                <Td>
                  <LevelBadge level={(r as any).level} />
                </Td>
                <Td className="truncate" title={(r as any).category ?? ""}>
                  {(r as any).category ?? "-"}
                </Td>
                <Td className="truncate" title={(r as any).event ?? ""}>
                  {(r as any).event ?? "-"}
                </Td>
                <Td className="truncate" title={(r as any).url ?? ""}>
                  {(r as any).url ?? "-"}
                </Td>
                <Td className="truncate" title={getReference(r)}>
                  {getReference(r)}
                </Td>
                <Td className="truncate" title={String((r as any).userId ?? "")}>
                  {(r as any).userId ?? "-"}
                </Td>
                <Td className="truncate" title={String((r as any).sessionId ?? "")}>
                  {(r as any).sessionId ?? "-"}
                </Td>
                <Td>
                  <div
                    className="rounded border bg-muted/30"
                    style={{
                      padding: "var(--spacing-2)",
                      maxHeight: 80,
                      overflowX: "auto",
                      overflowY: "auto",
                      whiteSpace: "nowrap",
                    }}
                    title={toPreview((r as any).payload)}
                  >
                    <code className="text-xs">{toPreview((r as any).payload)}</code>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- UI 部品（th/td にネイティブ属性を許可） ---------- */

function Th(
  { children, className, ...rest }: React.PropsWithChildren<
    React.ThHTMLAttributes<HTMLTableCellElement>
  >
) {
  return (
    <th className={cn("text-left font-medium px-3 py-2", className)} {...rest}>
      {children}
    </th>
  );
}

function Td(
  { children, className, ...rest }: React.PropsWithChildren<
    React.TdHTMLAttributes<HTMLTableCellElement>
  >
) {
  return (
    <td className={cn("align-top px-3 py-2", className)} {...rest}>
      {children}
    </td>
  );
}

function LevelBadge({ level }: { level?: string | null }) {
  const lv = String(level ?? "INFO").toUpperCase();
  const styleMap: Record<string, { cls: string }> = {
    INFO: { cls: "bg-secondary text-secondary-foreground" },
    WARN: { cls: "bg-primary/10 text-primary" },
    WARNING: { cls: "bg-primary/10 text-primary" },
    ERROR: { cls: "bg-destructive/10 text-destructive" },
  };
  const sty = styleMap[lv] ?? styleMap.INFO;

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center text-[11px] font-semibold",
        "px-2 py-[3px] rounded-full border",
        sty.cls
      )}
      style={{ borderColor: "transparent", minWidth: 44 }}
    >
      {lv}
    </span>
  );
}

/* ---------- helper ---------- */

// 参照情報：スキーマ差異に耐える（存在するキーを順に採用）
function getReference(r: EventLog): string {
  const x = r as any;
<<<<<<< HEAD
  return (
    x.referrer ??           // 一般
    x.referer ??            // 拼写ゆれ
    x.ref ??                // 短縮
    x.refId ??              // ID
    x.refType ??            // 種別
    "-"
  );
=======
  const v =
    x.referrer ??
    x.referer ??
    x.ref ??
    x.refId ??
    x.refType ??
    null;
  return v == null ? "-" : String(v);
>>>>>>> ce9b8053 (test(writer): LP個別timeout 12s→30s / preload適用導線整備（H-8 LEVEL2 Green）)
}

function fmtDateTime(input: Date | string): string {
  const d = new Date(input);
  // 例: 2025-10-03 12:59
  return d
    .toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    .replace(/\//g, "-");
}

function toPreview(payload: unknown): string {
  try {
    if (payload == null) return "-";
    if (typeof payload === "string") return payload;
    return JSON.stringify(payload);
  } catch {
    return "-";
  }
}

