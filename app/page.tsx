"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { notify } from "@/hooks/use-toast";

export default function HomePage() {
  // 初回レンダー時にデバッグトースト（必要なら有効化）
  useEffect(() => {
    // notify("debug ping", "info");
  }, []);

  return (
    <main className="p-6">
      <section className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">ShopWriter</h1>
        <p className="text-sm text-muted-foreground">
          トースト検証用：右上に表示されればOK（sonner / notify 統合）。
        </p>
      </section>

      <div className="flex gap-2 mt-4">
        <Button onClick={() => notify("manual ping", "info")} variant="default">
          再描画（info）
        </Button>
        <Button
          onClick={() => notify("操作成功の例", "success")}
          variant="secondary"
        >
          成功トースト
        </Button>
        <Button
          onClick={() => notify("操作失敗の例", "error")}
          variant="destructive"
        >
          失敗トースト
        </Button>
      </div>

      <section className="space-y-6 mt-10">
        <h2 className="text-xl font-semibold">開発メモ</h2>
        <ul className="list-disc pl-6 text-sm">
          <li>UI基盤: shadcn/ui + Tailwind, Toaster = sonner</li>
          <li>DB: Neon(PostgreSQL) + Prisma</li>
          <li>ルール: 小分け修正・検証 → 次へ</li>
        </ul>

        <h2 className="text-xl font-semibold pt-2">次の一手</h2>
        <p className="text-sm">
          共存・下書き・共有のフローを整理後、E2E検査を実施します。
        </p>

        <p className="text-sm space-x-3">
          <Link className="underline underline-offset-4" href="/dashboard">
            ダッシュボードへ
          </Link>
          <Link className="underline underline-offset-4" href="/debug">
            デバッグツールへ
          </Link>
        </p>
      </section>
    </main>
  );
}
