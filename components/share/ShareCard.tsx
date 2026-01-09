"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

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

async function patchShareIsPublic(args: { id: string; isPublic: boolean }) {
  const isDev = process.env.NODE_ENV !== "production";

  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
  };

  // dev契約吸収：/api/shares が X-User-Id を要求する場合がある
  if (isDev) {
    headers["x-user-id"] = "dev-user-1";
  }

  const res = await fetch("/api/shares", {
    method: "PATCH",
    headers,
    credentials: "include",
    body: JSON.stringify({ id: args.id, isPublic: args.isPublic }),
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) {
        const j = (await res.json()) as any;
        msg =
          typeof j?.error === "string"
            ? j.error
            : typeof j?.message === "string"
              ? j.message
              : msg;
      } else {
        const t = await res.text();
        if (t) msg = t.slice(0, 200);
      }
    } catch {
      // ignore
    }
    throw new Error(msg);
  }

  return res;
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

  // Hydration対策：初回レンダーでは window を使わない（SSR/CSR初期DOM一致）
  const [isManageDetail, setIsManageDetail] = useState(false);

  useEffect(() => {
    try {
      const p = window.location.pathname;
      setIsManageDetail(p.startsWith("/dashboard/share/"));
    } catch {
      setIsManageDetail(false);
    }
  }, []);

  const initialPublic = status === "Public";
  const [isPublic, setIsPublic] = useState<boolean>(initialPublic);
  const [saving, setSaving] = useState<boolean>(false);

  // 共有詳細（管理）ページのみ：公開/非公開の切替（B2）
  const showToggle = status !== undefined && variant === "card" && isManageDetail;

  const StatusChip = status ? (
    <span
      className="ml-2 inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] leading-none text-muted-foreground"
      aria-label={`status: ${isPublic ? "Public" : "Draft"}`}
      title={isPublic ? "Public" : "Draft"}
    >
      {isPublic ? "共有カード" : "下書き"}
    </span>
  ) : null;

  /** 共有リンクをコピーする機能（B3：非公開時に注意文を出す） */
  const handleCopyLink = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      await navigator.clipboard.writeText(window.location.origin + link);

      if (isPublic) {
        toast.success("共有リンクをコピーしました", {
          description: "コピーしたリンクを誰とでも共有できます。",
        });
      } else {
        toast.success("共有リンクをコピーしました", {
          description:
            "このカードは非公開です。相手が見られるようにするには「公開にする」を押してください。",
        });
      }
    } catch {
      toast.error("コピーできませんでした", {
        description: "もう一度お試しください。",
      });
    }
  };

  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (saving) return;

    const next = !isPublic;

    // 楽観更新
    setIsPublic(next);
    setSaving(true);

    try {
      await patchShareIsPublic({ id, isPublic: next });
      toast.success(next ? "公開にしました" : "非公開にしました", {
        description: next
          ? "公開ページのURLを共有できます。"
          : "公開ページは非公開になりました。",
      });
    } catch (err) {
      // rollback
      setIsPublic(!next);
      toast.error("切替に失敗しました", {
        description: err instanceof Error ? err.message : "もう一度お試しください。",
      });
    } finally {
      setSaving(false);
    }
  };

  const ToggleBar = showToggle ? (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-muted-foreground">
        現在：
        <span className="font-medium text-foreground">
          {isPublic ? "公開" : "非公開"}
        </span>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button
          type="button"
          variant={isPublic ? "outline" : "primary"}
          onClick={handleToggle}
          disabled={saving}
          aria-disabled={saving}
        >
          {saving ? "更新中..." : isPublic ? "非公開にする" : "公開にする"}
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={handleCopyLink}
          disabled={saving}
          aria-disabled={saving}
        >
          URLをコピー
        </Button>

        <Button asChild variant="outline">
          <Link href={link}>公開ページ</Link>
        </Button>
      </div>
    </div>
  ) : null;

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
      onClick={showToggle ? undefined : handleCopyLink}
      className="block h-full border rounded-2xl p-5 hover:bg-accent transition cursor-pointer"
      data-testid="share-card-card"
      title={showToggle ? undefined : "共有リンクをコピー"}
    >
      <div className="space-y-3">
        <div className="space-y-2">
          <h3 className="font-semibold text-base line-clamp-2 flex items-center">
            {title}
            {StatusChip}
          </h3>

          {body ? (
            <p className="text-sm text-muted-foreground line-clamp-3">{body}</p>
          ) : null}

          <div className="pt-1 text-xs text-muted-foreground">
            {updated ? `更新: ${updated}` : created ? `作成: ${created}` : ""}
          </div>
        </div>

        {ToggleBar}
      </div>
    </div>
  );
}
