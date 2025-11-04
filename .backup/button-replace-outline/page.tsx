import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Debug: Textarea (safe)",
  description: "文字化け復旧のためのプレーン表示（安全版）",
};

export default function Page() {
  return (
    <main className="p-6 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Debug: Textarea（安全版）</h1>
        <p className="text-sm text-muted-foreground">
          文字化け復旧のため、外部依存を外した最小ページです（表示確認用）。
        </p>
        <nav className="flex gap-4">
          <Link href="/" className="underline underline-offset-4">トップへ</Link>
          <Link href="/dashboard" className="underline underline-offset-4">ダッシュボード</Link>
        </nav>
      </header>

      <section className="rounded-2xl border p-4">
        <h2 className="font-semibold">テキスト入力（ダミー）</h2>
        <div className="mt-3 space-y-2">
          <label htmlFor="desc" className="text-sm font-medium">説明</label>
          <textarea
            id="desc"
            name="desc"
            rows={5}
            aria-describedby="desc-help desc-counter desc-error"
            className="w-full rounded-md border p-2 text-sm"
            defaultValue=""
          />
          <p id="desc-help" className="text-xs text-muted-foreground">
            最大 500 文字程度の説明を想定したダミー入力です。
          </p>
          <p id="desc-counter" className="text-xs text-muted-foreground">0 / 500</p>
          <p id="desc-error" className="sr-only"></p>
        </div>
      </section>
    </main>
  );
}

