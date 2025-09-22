import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "ShopWriter",
  description: "日本語EC向けのAIライティング支援ツール — Next.js + Prisma + shadcn/ui",
};

export default function Home() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <section className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">ShopWriter</h1>
        <p className="text-muted-foreground">
          日本語EC向けAIライティングのための実務特化アプリケーション。
          Zod契約・型チェック・テストで「生成精度アップ（Bプラン）」を継続改善中です。
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/dashboard">ダッシュボードへ</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/debug">デバッグ/ツール</Link>
          </Button>
        </div>
      </section>

      <section className="mt-12 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border p-5">
          <h2 className="font-semibold">開発メモ</h2>
          <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">
            <li>UI基盤：shadcn/ui + Tailwind、Toaster=sonner</li>
            <li>DB：Neon(PostgreSQL) / Prisma</li>
            <li>ルール：小分け修正 → 検証 → 次へ</li>
          </ul>
        </div>
        <div className="rounded-2xl border p-5">
          <h2 className="font-semibold">次の一手</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            共有・下書き・評価のフローを確認後、E2E検証を拡充します。
          </p>
        </div>
      </section>
    </main>
  );
}
