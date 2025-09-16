// app/dashboard/share/[id]/page.tsx
"use client";

import * as React from "react";
import { useRouter, useParams } from "next/navigation";

// ShareCard: default export。型を合わせるため ShareData も利用
import ShareCard, { type ShareData } from "@/components/share/ShareCard";

import { useNotify } from "@/components/providers/ToasterProvider";

export default function DashboardShareDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const notify = useNotify();

  const shareId = React.useMemo(() => String(params.id), [params.id]);

  // 状態は ShareCard 側の型に統一
  const [share, setShare] = React.useState<ShareData | null>(null);
  const [loading, setLoading] = React.useState<boolean>(true);
  // 親側でのビジー管理（UI抑止に使う場合はこのページ内で制御）
  const [busy, setBusy] = React.useState<false | "generate" | "delete">(false);

  // ---- 初回ロード -----------------------------------------------------------
  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/shares/${shareId}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        notify.error("共有情報の取得に失敗しました");
        setShare(null);
        return;
      }
      const data = (await res.json()) as ShareData;
      setShare(data);
    } catch (e) {
      console.error(e);
      notify.error("共有情報の取得でエラーが発生しました");
    } finally {
      setLoading(false);
    }
  }, [shareId, notify]);

  React.useEffect(() => {
    load();
  }, [load]);

  // ---- onGenerate: 公開URLの生成/再生成 -------------------------------------
  const handleGenerate = React.useCallback(async () => {
    if (!share) return;
    try {
      setBusy("generate");
      const res = await fetch(`/api/shares/${share.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ op: "regenerate", isPublic: true }),
      });
      if (!res.ok) {
        notify.error("公開URLの生成に失敗しました");
        return;
      }
      const data = (await res.json()) as ShareData;
      setShare(data);
      notify.success("公開URLを生成しました");
    } catch (e) {
      console.error(e);
      notify.error("公開URLの生成でエラーが発生しました");
    } finally {
      setBusy(false);
    }
  }, [share, notify]);

  // ---- onDelete: 共有レコード削除 -------------------------------------------
  const handleDelete = React.useCallback(async () => {
    if (!share) return;
    const ok = window.confirm("この共有リンクを削除します。よろしいですか？");
    if (!ok) return;

    try {
      setBusy("delete");
      const res = await fetch(`/api/shares/${share.id}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        notify.error("削除に失敗しました");
        return;
      }
      notify.success("削除しました");
      router.push("/dashboard");
    } catch (e) {
      console.error(e);
      notify.error("削除処理でエラーが発生しました");
    } finally {
      setBusy(false);
    }
  }, [share, notify, router]);

  // ---- onChanged: ShareCard のシグネチャに厳密一致 (next?: ShareData) -------
  const handleChanged = React.useCallback((next?: ShareData) => {
    if (!next) return;
    setShare((prev) => (prev ? { ...prev, ...next } : prev));
  }, []);

  // ---- レンダリング ---------------------------------------------------------
  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse h-6 w-40 rounded bg-muted mb-4" />
        <div className="animate-pulse h-24 w-full rounded bg-muted" />
      </div>
    );
  }

  if (!share) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">共有情報が見つかりませんでした。</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-4">
        <h1 className="text-xl font-semibold">共有リンクの管理</h1>
        <p className="text-sm text-muted-foreground">ID: {share.id}</p>
      </div>

      {/* ❌ loading プロップを渡さない（ShareCardProps に存在しないため） */}
      <ShareCard
        share={share}
        onGenerate={handleGenerate}
        onDelete={handleDelete}
        onChanged={handleChanged}
      />

      {/* 親側 busy を UI に反映したい場合は、必要に応じてここでボタンなどを無効化 */}
      {busy && (
        <p className="mt-4 text-xs text-muted-foreground">
          実行中: {busy === "generate" ? "生成中" : "削除中"}…
        </p>
      )}
    </div>
  );
}
