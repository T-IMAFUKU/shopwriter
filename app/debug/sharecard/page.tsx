"use client";

import * as React from "react";
import { Toaster } from "sonner";
import ShareCard, { type ShareData } from "@/components/share/ShareCard";
import notify from "@/lib/notify";

export default function DebugShareCardPage() {
  // サンプルデータ（createdAt: null も検証）
  const [item, setItem] = React.useState<ShareData>({
    id: "dbg_123456",
    title: "デバッグ用の共有カード",
    url: "/share/dbg_123456",
    createdAt: null,
    isPublic: true,
    views: 42,
    token: "dbg-token",
  });

  // 旧API互換も包括（ShareCard 側が any 包括で受ける）
  const onGenerate = async (_arg?: any) => {
    console.log("[debug] onGenerate:", _arg);
    setItem((prev) => ({ ...(prev ?? { id: "dbg_fallback" }), title: "生成後タイトル" }));
    notify.success("生成を開始しました");
  };

  const onDelete = async (_arg?: any) => {
    console.log("[debug] onDelete:", _arg);
    setItem((prev) =>
      prev
        ? { ...prev, isPublic: false, title: (prev.title ?? "") + "（削除フラグ）" }
        : { id: "dbg_deleted", title: "削除済み", url: "/share/dbg_deleted", isPublic: false }
    );
    notify.warn("削除（デモ）を実行しました");
  };

  const onCopy = async (id: string, url?: string | null) => {
    console.log("[debug] onCopy:", id, url);
    await notify.copy(url ?? "");
  };

  const onAction = (id: string, action: string) => {
    console.log("[debug] onAction:", id, action);
  };

  const onChanged = (next?: ShareData) => {
    console.log("[debug] onChanged:", next);
    if (next) setItem(next);
  };

  return (
    <main className="mx-auto my-8 max-w-3xl space-y-6 p-4">
      {/* ▼ 暫定：このページ内で Toaster を直置き（切り分け用） */}
      <Toaster position="top-right" richColors closeButton />

      <h1 className="text-xl font-semibold">/_debug / sharecard</h1>

      {/* 既存互換（card） */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-slate-600">variant="card"</h2>
        <ShareCard
          share={item}
          variant="card"
          onGenerate={onGenerate}
          onDelete={onDelete}
          onCopy={onCopy}
          onAction={onAction}
          onChanged={onChanged}
        />
      </section>

      {/* 一覧向け（row） */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-slate-600">variant="row"</h2>
        <ShareCard
          share={item}
          variant="row"
          onGenerate={onGenerate}
          onDelete={onDelete}
          onCopy={onCopy}
          onAction={onAction}
          onChanged={onChanged}
        />
      </section>

      {/* 手動テスト用ボタン */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-slate-600">notify 手動テスト</h2>
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
            onClick={() => notify.success("成功トーストのテスト")}
          >
            success
          </button>
          <button
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700"
            onClick={() => notify.info("情報トーストのテスト")}
          >
            info
          </button>
          <button
            className="rounded-md bg-amber-500 px-3 py-1.5 text-sm font-medium text-white"
            onClick={() => notify.warn("警告トーストのテスト")}
          >
            warn
          </button>
          <button
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white"
            onClick={() => notify.error("失敗トーストのテスト")}
          >
            error
          </button>
        </div>
      </section>
    </main>
  );
}
