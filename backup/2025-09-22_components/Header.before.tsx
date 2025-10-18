import Link from "next/link";

export default function SiteHeader() {
  return (
    <header className="border-b bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="font-semibold">
          ShopWriter
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/dashboard" className="hover:underline">
            ダッシュボード
          </Link>
          <Link href="/docs" className="hover:underline">
            ドキュメント
          </Link>
          <Link href="/writer" className="hover:underline">
            ライター
          </Link>
        </nav>
      </div>
    </header>
  );
}

