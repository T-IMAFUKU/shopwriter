"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Toaster, toast } from "sonner";

export default function ToasterDebugPage() {
  const [count, setCount] = useState(0);
  const [fired, setFired] = useState(false);
  const checking = useRef(false);

  const measure = () => {
    const n = document.querySelectorAll("[data-sonner-toaster]").length;
    setCount(n);
  };

  // 初回：トーストを発火 → 少し待ってから個数カウント
  useEffect(() => {
    if (checking.current) return;
    checking.current = true;
    try {
      toast("debug ping");
      setFired(true);
    } catch {}
    setTimeout(measure, 150);
  }, []);

  const recheck = () => {
    toast("manual ping");
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
      <h1 className="text-2xl font-bold">Toaster 最終検証（直置き）</h1>
      <p className="text-sm text-muted-foreground">
        このページ内に <code>&lt;Toaster /&gt;</code> を直置きしています（原因切り分け用）。
      </p>

      <div className="rounded-xl border p-4 space-y-2">
        <div className="text-lg">{status}</div>
        <div className="text-sm">現在個数: {count}</div>
        <div className="text-sm">テスト発火: {fired ? "済み" : "未実行"}</div>
        <button onClick={recheck} className="mt-2 px-4 py-2 rounded-lg border" aria-label="再検査">
          再検査（手動発火）
        </button>
      </div>

      {/* ←—— 直置き（ここがある限り、このページでは必ず出ます） */}
      <Toaster richColors position="top-right" />
    </main>
  );
}
