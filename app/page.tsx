"use client";

import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * ShopWriter — Home (Production)
 * - ヒーロー行動（トースト検証の3ボタン）は size="lg" で視認性を上げる
 * - 余白・typography は最小限。導線: /dashboard /dev
 */
export default function HomePage() {
  return (
    <main className="p-6">
      <section className="mx-auto max-w-3xl space-y-6">
        {/* Hero */}
        <header className="space-y-2">
          <h1 className="text-3xl font-bold">ShopWriter</h1>
          <p className="text-sm text-muted-foreground">
            トースト検証用：右上に表示されればOK（sonner / notify 統合）。
          </p>
        </header>

        {/* Actions（size=lg で“詰まり感”を解消） */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            id="btn-info"
            size="lg"
            variant="secondary"
            onClick={() => toast.info("情報：UIは正常に動作しています。")}
          >
            再描画（info）
          </Button>
          <Button
            id="btn-success"
            size="lg"
            onClick={() => toast.success("成功トースト：操作が完了しました。")}
          >
            成功トースト
          </Button>
          <Button
            id="btn-error"
            size="lg"
            variant="destructive"
            onClick={() => toast.error("失敗トースト：エラーが発生しました。")}
          >
            失敗トースト
          </Button>
        </div>

        {/* Quick Nav（現状密度が良いので default のまま） */}
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">次の一手</h2>
          <p className="text-sm text-muted-foreground">
            共有・下書き・共有のフローを整理後、E2E検査を実施します。
          </p>
          <nav className="flex flex-wrap gap-3">
            <Link href="/dashboard">
              <Button className="ui-btn" variant="outline">ダッシュボードへ</Button>
            </Link>
            <Link href="/dev">
              <Button className="ui-btn" variant="secondary">デバッグツールへ</Button>
            </Link>
          </nav>
        </section>

        {/* Notes */}
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">開発メモ</h2>
          <ul className="list-disc pl-6 text-sm">
            <li>UI基盤: shadcn/ui + Tailwind, Toaster = sonner</li>
            <li>DB: Neon(PostgreSQL) + Prisma</li>
            <li>ルール: 小分け修正・検証 → 次へ</li>
          </ul>
        </section>
      </section>
    </main>
  );
}
