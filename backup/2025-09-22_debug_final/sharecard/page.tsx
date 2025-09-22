import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Debug: ShareCard (safe)",
  description: "ビルド阻害を避けるための一時的なプレーン表示（安全版）",
};

export default function Page() {
  return (
    <main className="p-6 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Debug: ShareCard（安全版）</h1>
        <p className="text-sm text-muted-foreground">
          文字化け復旧のため、外部依存を外した最小ページです（表示確認用）。
        </p>
        <div className="flex gap-3">
          <Button asChild><Link href="/">トップへ</Link></Button>
          <Button variant="outline" asChild><Link href="/dashboard">ダッシュボード</Link></Button>
        </div>
      </header>

      <section className="rounded-2xl border p-4">
        <h2 className="font-semibold">ダミーデータ</h2>
        <div className="mt-3 grid gap-1 text-sm">
          <div><span className="font-medium">ID:</span> dbg_0001</div>
          <div><span className="font-medium">タイトル:</span> サンプル共有カード</div>
          <div><span className="font-medium">説明:</span> これはビルド通過を最優先した安全版です。</div>
          <div><span className="font-medium">ステータス:</span> draft</div>
          <div><span className="font-medium">更新日時:</span> {new Date().toISOString()}</div>
        </div>
      </section>
    </main>
  );
}
