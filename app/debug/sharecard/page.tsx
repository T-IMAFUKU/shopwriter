import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Debug: ShareCard (safe)",
  description: "ビルド阻害を避けるための一時的なプレーンページ（安全版）",
};

export default function Page() {
  return (
    <main className="p-6 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Debug: ShareCard（安全版）</h1>
        <p className="text-sm text-muted-foreground">
          文字化け復旧のため、外部依存を外した最小構成です（表示確認用）。
        </p>
        <nav className="flex gap-4">
          <Link href="/" className="underline underline-offset-4">トップへ</Link>
          <Link href="/dashboard" className="underline underline-offset-4">ダッシュボード</Link>
        </nav>
      </header>

      <section className="rounded-2xl border p-4">
        <h2 className="font-semibold">ダミーデータ</h2>
        <div className="mt-3 grid gap-1 text-sm">
          <div><span className="font-medium">ID:</span> dbg_0001</div>
          <div><span className="font-medium">タイトル:</span> サンプル共有カード</div>
          <div><span className="font-medium">説明:</span> これはビルド通過を最優先した安全版です。</div>
          <div><span className="font-medium">ステータス:</span> draft</div>
          <div><span className="font-medium">更新日時:</span> static</div>
        </div>
      </section>
    </main>
  );
}

