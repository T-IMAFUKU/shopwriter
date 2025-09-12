"use client";

import Link from "next/link";

export default function Home() {
  return (
    <main className="p-6 max-w-5xl mx-auto space-y-10">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">ShopWriter</h1>
        <nav className="flex gap-3">
          {/* ← ここがポイント：callbackUrl=/writer を明示 */}
          <Link
            href="/api/auth/signin?callbackUrl=/writer"
            className="px-4 py-2 rounded-md border shadow-sm"
          >
            GitHubでサインイン
          </Link>
        </nav>
      </header>

      <section className="space-y-3">
        <h2 className="text-3xl font-extrabold leading-tight">
          ShopWriter — 商品説明を、一瞬で。
        </h2>
        <p className="text-muted-foreground">
          Next.js + Prisma 構成のライティング支援SaaS。ヒーロー＋3カードのトップページです。
        </p>

        <div className="flex gap-3">
          <Link
            href="/writer"
            className="px-4 py-2 rounded-md border shadow-sm"
          >
            無料で試す
          </Link>
          <Link
            href="/api/auth/signin?callbackUrl=/writer"
            className="px-4 py-2 rounded-md border shadow-sm"
          >
            GitHubでサインイン
          </Link>
        </div>
      </section>

      {/* 以下はダミーUI（任意） */}
      <section className="space-y-4">
        <div className="rounded-xl border p-4 space-y-3">
          <label className="block text-sm font-medium">商品名（例：速乾タオル）</label>
          <input className="w-full border rounded-md px-3 py-2" placeholder="ShopWriter" />
          <label className="block text-sm font-medium">想定読者</label>
          <input className="w-full border rounded-md px-3 py-2" placeholder="WEBユーザー" />
          <button className="px-4 py-2 rounded-md border shadow-sm">生成する</button>
        </div>
      </section>
    </main>
  );
}
