import * as React from "react";

export type ShareStatus = "draft" | "public" | "private" | "archived";

export type Share = {
  id: string;
  title: string;
  description?: string;
  status?: ShareStatus;
  createdAt?: string;
  updatedAt?: string;
};

export type ShareCardProps = Share & {
  /** 一部画面で指定される可変表示。未指定は "card" 扱い */
  variant?: "card" | "row";
  className?: string;
};

/**
 * 依存最小の安全版 ShareCard。
 * - 既存ページの `<ShareCard {...s} />` や `<ShareCard {...item} variant="card" />` に対応
 * - 文字化け復旧 / 型不整合の解消を優先し、UIはプレーンな div ベース
 */
export default function ShareCard({
  id,
  title,
  description,
  status = "draft",
  createdAt,
  updatedAt,
  variant = "card",
  className,
}: ShareCardProps) {
  const badge =
    status === "public"
      ? "bg-emerald-600 text-white"
      : status === "private"
      ? "bg-slate-600 text-white"
      : status === "archived"
      ? "bg-zinc-500 text-white"
      : "bg-amber-500 text-white"; // draft

  return (
    <article
      data-variant={variant}
      className={
        "rounded-xl border p-4 shadow-sm " +
        (variant === "row" ? "flex items-center justify-between" : "space-y-2") +
        (className ? " " + className : "")
      }
    >
      <header className="flex items-start justify-between gap-4">
        <h3 className="text-base font-semibold leading-tight">{title}</h3>
        <span
          className={
            "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium " +
            badge
          }
          aria-label={`status: ${status}`}
        >
          {status}
        </span>
      </header>

      {description ? (
        <p className="text-sm text-muted-foreground">{description}</p>
      ) : null}

      <dl className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        {createdAt && (
          <>
            <dt className="opacity-70">Created</dt>
            <dd>{createdAt}</dd>
          </>
        )}
        {updatedAt && (
          <>
            <dt className="opacity-70">Updated</dt>
            <dd>{updatedAt}</dd>
          </>
        )}
        <dt className="opacity-70">ID</dt>
        <dd>{id}</dd>
      </dl>
    </article>
  );
}
