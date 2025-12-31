"use client";

import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Props = {
  shareId: string;
  body: string;
  isPublic: boolean;
  /**
   * 最短MVP：ローカル検証用（dev-user-1 固定）
   * 本番は NextAuth 接続後に置換する想定（Step外）
   */
  ownerHeaderUserId?: string;
};

export function ShareOwnerActions({
  shareId,
  body,
  isPublic,
  ownerHeaderUserId = "dev-user-1",
}: Props) {
  const [busy, setBusy] = useState(false);

  const nextIsPublic = useMemo(() => !isPublic, [isPublic]);

  const onCopy = useCallback(async () => {
    try {
      const text = (body ?? "").trim();
      if (!text) {
        toast.error("コピーできる本文がありません。");
        return;
      }
      await navigator.clipboard.writeText(text);
      toast.success("本文をコピーしました。");
    } catch {
      toast.error("コピーに失敗しました。");
    }
  }, [body]);

  const onTogglePublic = useCallback(async () => {
    if (busy) return;

    try {
      const id = (shareId ?? "").trim();
      if (!id) {
        toast.error("ID が取得できませんでした。");
        return;
      }

      setBusy(true);

      toast.message(nextIsPublic ? "公開に切り替え中…" : "非公開に切り替え中…");

      const res = await fetch("/api/shares", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": ownerHeaderUserId,
        },
        body: JSON.stringify({ id, isPublic: nextIsPublic }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        toast.error(txt ? `更新に失敗しました: ${txt}` : "更新に失敗しました。");
        return;
      }

      toast.success("更新しました。");
      window.location.reload();
    } catch {
      toast.error("更新に失敗しました。");
    } finally {
      setBusy(false);
    }
  }, [busy, shareId, nextIsPublic, ownerHeaderUserId]);

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant={isPublic ? "secondary" : "primary"}
        type="button"
        onClick={onTogglePublic}
        disabled={busy}
        aria-disabled={busy}
      >
        {isPublic ? "非公開にする" : "公開にする"}
      </Button>

      <Button
        size="sm"
        variant="secondary"
        type="button"
        onClick={onCopy}
        disabled={!body?.trim()}
        aria-disabled={!body?.trim()}
        title={!body?.trim() ? "コピーできる本文がありません" : "本文をコピー"}
      >
        本文をコピー
      </Button>
    </div>
  );
}
