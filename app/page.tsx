"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify"; // ← named import に統一

export default function HomePage() {
  // 初回レンダー時に軽いデバッグトースト
  useEffect(() => {
    notify("debug ping", "info");
  }, []);

  return (
    <main className="p-6">
      <section className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">ShopWriter</h1>
        <p className="text-sm text-muted-foreground">
          トースト検証用：右上に表示されればOK（sonner / notify 経由）。
        </p>

        <div className="flex gap-2">
          <Button onClick={() => notify("manual ping", "info")} variant="default">
            再検査（info）
          </Button>
          <Button onClick={() => notify("操作成功の例", "success")} variant="secondary">
            成功トースト
          </Button>
          <Button onClick={() => notify("操作失敗の例", "error")} variant="destructive">
            失敗トースト
          </Button>
        </div>
      </section>
    </main>
  );
}
