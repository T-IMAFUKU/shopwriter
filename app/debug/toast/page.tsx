"use client";

// 副作用インポート：このモジュールが読み込まれるだけで
// lib/notify.ts の window.__notifySmoke 登録処理が必ず実行される
import "@/lib/notify";

import { useState } from "react";
import { appToast } from "@/lib/toast";

export default function ToastDebugPage() {
  const [pending, setPending] = useState(false);

  const runOk = async () => {
    setPending(true);
    try {
      await appToast.promise(
        new Promise((resolve) => setTimeout(resolve, 1200)),
        { loading: "処理中", success: "成功しました", error: "失敗しました" }
      );
    } finally {
      setPending(false);
    }
  };

  const runNg = async () => {
    setPending(true);
    try {
      await appToast.promise(
        new Promise((_, reject) => setTimeout(() => reject(new Error("NG")), 1200)),
        { loading: "処理中", success: "成功しました", error: "失敗しました" }
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-8 space-y-6">
      <h1 className="text-2xl font-bold">Toast Debug</h1>

      <section className="space-y-3">
        <div className="flex flex-wrap gap-3">
          <button
            className="px-3 py-2 rounded bg-green-600 text-white"
            onClick={() => appToast.created("デモ")}
          >
            作成成功（2600ms）
          </button>

          <button
            className="px-3 py-2 rounded bg-sky-600 text-white"
            onClick={() => appToast.info("情報です")}
          >
            情報（2600ms）
          </button>

          <button
            className="px-3 py-2 rounded bg-amber-600 text-white"
            onClick={() => appToast.validation("必須項目を入力してください")}
          >
            警告（4000ms）
          </button>

          <button
            className="px-3 py-2 rounded bg-rose-600 text-white"
            onClick={() => appToast.failure("サーバ内部エラー")}
          >
            エラー（4000ms）
          </button>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            className="px-3 py-2 rounded border"
            disabled={pending}
            onClick={runOk}
          >
            promise成功（loading→成功2600ms）
          </button>

        <button
            className="px-3 py-2 rounded border"
            disabled={pending}
            onClick={runNg}
          >
            promise失敗（loading→失敗4000ms）
          </button>
        </div>
      </section>

      <p className="text-sm text-muted-foreground">
        ※ 位置/色/closeButton は <code>app/providers.tsx</code> の Toaster 設定（右上・richColors・closeButton・2600ms）に準拠
      </p>
    </main>
  );
}

