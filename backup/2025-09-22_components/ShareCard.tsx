"use client";

import * as React from "react";
import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { Copy, MoreVertical, RefreshCw, Trash2, ExternalLink } from "lucide-react";

// ▼ ここを相対パスに修正（backup 配下でも確実に解決）
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "../../components/ui/dropdown-menu";

// ★ sonner直呼び出しは禁止。通知はすべて notify 経由に統一（相対パスで確実解決）
import {
  notifySuccess,
  notifyError,
  notifyInfo,
} from "../../src/lib/notify";

export type ShareStatus = "draft" | "public" | "archived";

export type ShareCardProps = {
  id: string;
  title: string;
  description?: string;
  status?: ShareStatus;
  variant?: "card" | "row";
  onRegenerate?: () => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
};

/** 公開URLを生成（SSR/CSR両対応） */
export function buildShareUrl(id: string): string {
  if (!id) return "";
  if (typeof window === "undefined") {
    // SSR: 相対パスで返す（リンク先で解決）
    return `/share/${id}`;
  }
  const url = new URL(window.location.href);
  url.pathname = `/share/${id}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function StatusBadge({ status }: { status?: ShareStatus }) {
  switch (status) {
    case "public":
      return <Badge variant="outline">公開中</Badge>;
    case "archived":
      return <Badge variant="secondary">アーカイブ</Badge>;
    case "draft":
    default:
      return <Badge>下書き</Badge>;
  }
}

export default function ShareCard({
  id,
  title,
  description,
  status = "draft",
  variant = "card",
  onRegenerate,
  onDelete,
}: ShareCardProps) {
  const router = useRouter();

  const handleCopy = useCallback(async () => {
    try {
      const url = buildShareUrl(id);
      await navigator.clipboard.writeText(url);
      notifySuccess("共有URLをコピーしました", { description: url, id: "share-copy" });
    } catch {
      notifyError("コピーに失敗しました", { id: "share-copy" });
    }
  }, [id]);

  const handleOpen = useCallback(() => {
    const url = buildShareUrl(id);
    window.open(url, "_blank", "noreferrer");
    notifyInfo("共有ページを新しいタブで開きました", { id: "share-open", duration: 2600 });
  }, [id]);

  const handleRegenerate = useCallback(async () => {
    try {
      if (onRegenerate) await onRegenerate();
      notifySuccess("内容を再生成しました", { id: "share-regenerate" });
    } catch {
      notifyError("再生成に失敗しました", { id: "share-regenerate" });
    }
  }, [onRegenerate]);

  const handleDelete = useCallback(async () => {
    try {
      if (onDelete) await onDelete();
      notifySuccess("削除しました", { id: "share-delete" });
      router.refresh();
    } catch {
      notifyError("削除に失敗しました", { id: "share-delete" });
    }
  }, [onDelete, router]);

  const Body = (
    <div className="flex w-full items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold leading-none tracking-tight truncate">{title}</h3>
          <StatusBadge status={status} />
        </div>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{description}</p>
        ) : null}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Button size="icon" variant="ghost" onClick={handleCopy} aria-label="共有URLをコピー">
          <Copy className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={handleOpen} aria-label="共有ページを開く">
          <ExternalLink className="h-4 w-4" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" aria-label="その他操作">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel>操作</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleRegenerate}>
              <RefreshCw className="mr-2 h-4 w-4" />
              再生成
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={handleDelete}>
              <Trash2 className="mr-2 h-4 w-4" />
              削除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  if (variant === "row") {
    return <div className="w-full">{Body}</div>;
  }

  return (
    <div className="w-full rounded-2xl border bg-card p-4 shadow-sm">
      {Body}
    </div>
  );
}
