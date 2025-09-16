"use client";

import * as React from "react";
import Link from "next/link";
import { twMerge } from "tailwind-merge";

/**
 * Step 1.7: ShareCard（型エラー解消・互換ラッパー）
 * - variant: "card" | "row"
 * - ShareData を export（呼び出し側の import 復旧）
 * - createdAt に null 許容（dashboard 側の null 実データに対応）
 * - onChanged を props に追加（呼び出し側の監視フック）
 * - onGenerate / onDelete は引数 any を許容（旧/新/引数なしを包括）
 *   ※ 実行時は item を渡す（引数なし実装でも無害・string 期待にも対応可）
 * - badge/dropdown/notify 依存は未使用（後続で置換）
 */

export type ShareData = {
  id: string;
  title?: string | null;
  url?: string | null;                // 公開URL（例: /share/[id]）
  createdAt?: string | Date | null;   // ← null 許容に拡張
  views?: number | null;
  isPublic?: boolean | null;
  token?: string | null;
};

type BaseHandlers = {
  /** 共有URLコピー押下 */
  onCopy?: (id: string, url?: string | null) => void | Promise<any>;
  /** 削除押下（引数 any で旧/新/引数なしを包括） */
  onDelete?: (arg?: any) => void | Promise<any>;
  /** 任意：その他アクション */
  onAction?: (id: string, action: string) => void | Promise<any>;
  /** 変更通知（呼び出し側で状態更新） */
  onChanged?: (next?: ShareData) => void | Promise<any>;
};

// 新API
type NewProps = {
  share?: ShareData;
  variant?: "card" | "row";
  className?: string;
} & BaseHandlers;

// 旧API互換
type LegacyProps = {
  data?: ShareData;
  /** 旧: 生成ハンドラ（引数 any で包括） */
  onGenerate?: (arg?: any) => void | Promise<any>;
} & Omit<NewProps, "share">;

export type ShareCardProps = NewProps & LegacyProps;

export default function ShareCard(props: ShareCardProps) {
  const item: ShareData | undefined = props.share ?? props.data;
  const variant: "card" | "row" = props.variant ?? "card";

  if (!item?.id) return null;

  const { onCopy, onDelete, onAction, onChanged, onGenerate, className } = props;

  const title = item.title ?? "（無題）";
  const href = safeUrl(item.url, item.id);
  const created = toDisplayDate(item.createdAt);
  const views = item.views ?? undefined;
  const isPublic = !!item.isPublic;

  // 簡易 Badge（後で shadcn/ui Badge に置換）
  const StatusBadge = () => (
    <span
      aria-label={isPublic ? "公開" : "非公開"}
      className={twMerge(
        "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium",
        isPublic
          ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200"
          : "bg-slate-50 text-slate-600 ring-1 ring-inset ring-slate-200"
      )}
    >
      {isPublic ? "Public" : "Private"}
    </span>
  );

  // 操作群（Dropdown 未導入の暫定ボタン）
  const Actions = () => (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className={buttonClass()}
        onClick={() => {
          onCopy?.(item.id, href);
          onAction?.(item.id, "copy");
          console.log("[ShareCard] copy:", href);
        }}
        aria-label="共有URLをコピー"
      >
        コピー
      </button>

      {onGenerate && (
        <button
          type="button"
          className={buttonClass("secondary")}
          onClick={async () => {
            await onGenerate(item);            // ← any 受け入れ（ShareData を渡す）
            onAction?.(item.id, "generate");
            console.log("[ShareCard] generate:", item.id);
          }}
          aria-label="生成する（互換）"
        >
          生成
        </button>
      )}

      {onDelete && (
        <button
          type="button"
          className={buttonClass("danger")}
          onClick={async () => {
            await onDelete(item);              // ← any 受け入れ（引数なし実装でも無害）
            onAction?.(item.id, "delete");
            onChanged?.();                     // 削除後に変更通知
            console.log("[ShareCard] delete:", item.id);
          }}
          aria-label="共有を削除"
        >
          削除
        </button>
      )}
    </div>
  );

  if (variant === "row") {
    // 行レイアウト（Dashboard 一覧向け）
    return (
      <div
        className={twMerge(
          "w-full grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2",
          className
        )}
        role="group"
        aria-label={`共有 ${title}`}
      >
        <div className="min-w-0 flex items-center gap-3">
          <StatusBadge />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Link
                href={href}
                className="truncate font-medium text-slate-900 hover:underline"
                title={title}
              >
                {title}
              </Link>
              {views !== undefined && (
                <span className="shrink-0 text-xs text-slate-500">{views} views</span>
              )}
            </div>
            <div className="truncate text-xs text-slate-500">
              {href} ・ {created}
            </div>
          </div>
        </div>
        <Actions />
      </div>
    );
  }

  // カードレイアウト（既存）
  return (
    <div
      className={twMerge(
        "flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4",
        className
      )}
      role="group"
      aria-label={`共有 ${title}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <h3 className="truncate text-base font-semibold text-slate-900" title={title}>
              {title}
            </h3>
            <StatusBadge />
          </div>
          <div className="truncate text-sm text-slate-600">
            <Link href={href} className="hover:underline">
              {href}
            </Link>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            作成: {created}
            {views !== undefined && <span> ・ {views} views</span>}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <Actions />
      </div>
    </div>
  );
}

/** tailwind 簡易ボタン（後で shadcn/ui Button に置換可） */
function buttonClass(variant: "primary" | "secondary" | "danger" = "primary") {
  switch (variant) {
    case "secondary":
      return "inline-flex items-center rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400";
    case "danger":
      return "inline-flex items-center rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400";
    default:
      return "inline-flex items-center rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400";
  }
}

/** URL 安全化（null/undefined でも `/share/[id]` にフォールバック） */
function safeUrl(url: string | null | undefined, id: string) {
  const u = (url ?? "").trim();
  if (!u) return `/share/${encodeURIComponent(id)}`;
  try {
    const parsed = new URL(u, "http://localhost");
    return u.startsWith("http") ? u : parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return `/share/${encodeURIComponent(id)}`;
  }
}

/** 日付表示（JST想定） */
function toDisplayDate(input?: string | Date | null) {
  if (!input) return "—";
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "—";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm}`;
}
