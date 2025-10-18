"use client";

import Link from "next/link";
import { useMemo } from "react";
import { toast } from "sonner";

export type ShareCardProps = {
  id: string;
  title: string;
  /** 本文：excerpt / description どちらでも可（後方互換） */
  excerpt?: string;
  description?: string;
  /** 呼び出し側が渡してくる公開状態（ダッシュボード互換） */
  status?: "Public" | "Draft";
  /** 明示リンク先（未指定なら /share/[id]） */
  href?: string;
  variant?: "card" | "row";
  /** ISO文字列（例: "2025-09-23T10:12:34.000Z"） */
  createdAtISO?: string | null;
  updatedAtISO?: string | null;
};

function useDateLabel(iso?: string | null) {
  return useMemo(() => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  }, [iso]);
}

export default function ShareCard({
  id,
  title,
  excerpt,
  description,
  status,
  href,
  variant = "card",
  createdAtISO,
  updatedAtISO,
}: ShareCardProps) {
  const created = useDateLabel(createdAtISO);
  const updated = useDateLabel(updatedAtISO);
  const link = href ?? `/share/${id}`;
  const body = excerpt ?? description ?? "";

  const StatusChip = status ? (
    <span
      className="ml-2 inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] leading-none text-muted-foreground"
      aria-label={`status: ${status}`}
      title={status}
    >
      {status === "Public" ? "共有カード" : "下書き"}
    </span>
  ) : null;

  /** 共有リンクをコピーする機能 */
  const handleCopyLink = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(window.location.origin + link);
      toast.success("共有リンクをコピーしました", {
        description: "コピーしたリンクを誰とでも共有できます。",
      });
    } catch {
      toast.error("コピーできませんでした", {
        description: "もう一度お試しください。",
      });
    }
  };

  if (variant === "row") {
    return (
      <div
        onClick={handleCopyLink}
        className="block w-full border rounded-xl p-4 hover:bg-accent transition cursor-pointer"
        data-testid="share-card-row"
        title="共有リンクをコピー"
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-medium line-clamp-1 flex items-center">
            {title}
            {StatusChip}
          </h3>
          <div className="text-xs text-muted-foreground shrink-0">
            {updated || created}
          </div>
        </div>
        {body ? (
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
            {body}
          </p>
        ) : null}
      </div>
    );
  }

  // variant === "card"
  return (
    <div
      onClick={handleCopyLink}
      className="block h-full border rounded-2xl p-5 hover:bg-accent transition cursor-pointer"
      data-testid="share-card-card"
      title="共有リンクをコピー"
    >
      <div className="space-y-2">
        <h3 className="font-semibold text-base line-clamp-2 flex items-center">
          {title}
          {StatusChip}
        </h3>
        {body ? (
          <p className="text-sm text-muted-foreground line-clamp-3">{body}</p>
        ) : null}
        <div className="pt-2 text-xs text-muted-foreground">
          {updated ? `更新: ${updated}` : created ? `作成: ${created}` : ""}
        </div>
      </div>
    </div>
  );
}
