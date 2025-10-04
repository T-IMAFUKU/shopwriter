"use client";

import { useEffect, useMemo, useState } from "react";
import { appToast } from "@/lib/toast";

export default function ToasterDebugPage() {
  const [count, setCount] = useState(0);
  const [fired, setFired] = useState(false);

  const measure = () => {
    const n = document.querySelectorAll("[data-sonner-toaster]").length;
    setCount(n);
  };

  // 初回：描画完了後に非同期でトーストを発火
  useEffect(() => {
    const t = setTimeout(() => {
      appToast.info("debug ping");
      setFired(true);
      setTimeout(measure, 150);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const recheck = () => {
    appToast.info("manual ping");
    setFired(true);
    setTimeout(measure, 150);
  };

  const status = useMemo(() => {
    if (count === 1) return "✅ 合格：Toaster は 1 個のみ存在";
    if (count > 1) return `⚠️ 注意：Toaster が ${count} 個存在（重複）`;
    return "❌ 不合格：Toaster が見つかりません";
  }, [count]);

  return (
    <main className="container mx-auto max-w-2xl py-8 space-y-4">
      <h1 className="text-2xl font-bold">Toaster 最終検証（appToast版）</h1>
      <p className="text-sm text-muted-foreground">
        グローバル Providers 内の <code>&lt;Toaster /&gt;</code> を使用しています。
      </p>

      <div className="rounded-xl border p-4 space-y-2">
        <div className="text-lg">{status}</div>
        <div className="text-sm">現在個数: {count}</div>
        <div className="text-sm">テスト発火: {fired ? "済み" : "未実行"}</div>
        <button
          onClick={recheck}
          className="mt-2 px-4 py-2 rounded-lg border"
          aria-label="再検査"
        >
          再検査（手動発火）
        </button>
      </div>
    </main>
  );
}
