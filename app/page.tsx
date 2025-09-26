// app/page.tsx
import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-8 space-y-6">
      <h1 className="text-2xl font-bold">ShopWriter</h1>

      <p className="text-sm leading-7">
        日本語EC向けAIライティングのための実務特化アプリケーション。Zod契約・型チェック・テストで「生成精度アップ（Bプラン）」を継続改善中です。
      </p>

      <p className="space-x-3 text-sm">
        <Link className="underline underline-offset-4" href="/dashboard">ダッシュボードへ</Link>
        <Link className="underline underline-offset-4" href="/debug">デバッグツール</Link>
      </p>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">開発メモ</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>UI基盤：shadcn/ui + Tailwind、Toaster = sonner</li>
          <li>DB：Neon(PostgreSQL) / Prisma</li>
          <li>ルール：小分け修正 → 検証 → 次へ</li>
        </ul>
      </section>

      <section className="pt-2">
        <h2 className="text-xl font-semibold">次の一手</h2>
        <p className="text-sm">共有・下書き・評価のフローを確認後、E2E検証を拡充します。</p>
      </section>
    </main>
  );
}
