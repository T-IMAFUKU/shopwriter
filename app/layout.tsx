import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Providers } from "./providers"; // providers側にToaster内包
import dynamic from "next/dynamic";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Crown } from "lucide-react";
import { Logo } from "@/components/Logo"; // ← ブランドアイコン
import { AuthButton } from "@/components/AuthButton";

// ===== グローバル・ヘルプ（遅延なしで安定読込）=====
const HelpDropdown = dynamic(() => import("@/components/global/HelpDropdown"), {
  ssr: true,
});

// ===== フォント =====
const inter = Inter({ subsets: ["latin"] });

// ===== サイトURL（.env の NEXT_PUBLIC_SITE_URL を優先）=====
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const ogImage = "/opengraph-image"; // ← 自動生成OGPへの差し替え

// ===== メタデータ（日本語SEO最適化）=====
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "ShopWriter",
  title: {
    default: "ShopWriter｜AIが設計する、あなたの商品の魅力と言葉。",
    template: "%s｜ShopWriter",
  },
  description:
    "ShopWriterは、日本語の“伝わる文章”に特化したAIライティング。質問に答えるだけで、商品の魅力が伝わるプロ品質の文章を作成。販売ページ・プロダクト説明・ニュースレターに最適。検索にも配慮。",
  keywords: [
    "AI文章生成",
    "日本語SEO",
    "商品説明",
    "販売ページ",
    "LPライティング",
    "自動ライティング",
    "コピーライティング",
    "ShopWriter",
  ],
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "ShopWriter",
    locale: "ja_JP",
    title: "ShopWriter｜AIが設計する、あなたの商品の魅力と言葉。",
    description:
      "説明ではなく、魅力を語る文章を。質問に答えるだけでプロ品質の販売文を作成。日本語SEOにも配慮した設計です。",
    images: [
      {
        url: ogImage, // ← 自動OGP
        width: 1200,
        height: 630,
        alt: "ShopWriter — AIが設計する、あなたの商品の魅力と言葉。",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ShopWriter｜AIが設計する、あなたの商品の魅力と言葉。",
    description:
      "商品の魅力が伝わる日本語文章を、AIが構成から設計。販売ページ・説明文・ニュースレターに最適。",
    images: [ogImage], // ← 自動OGP
    creator: "@", // 任意
  },
  icons: {
    icon: [{ url: "/favicon.ico" }, { url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-touch-icon.png" }],
  },
};

// ===== Viewport（旧 themeColor はここ）=====
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" suppressHydrationWarning>
      {/* 透け根治ポイント：最上位(body)に isolate を適用 */}
      <body
        className={[
          inter.className,
          "isolate min-h-dvh bg-background text-foreground antialiased",
        ].join(" ")}
      >
        {/* グローバル Provider（Toaster は providers 内で1つだけ提供） */}
        <Providers>
          {/* ==== グローバルヘッダー（ブランド＋CTA＋ログイン＋ヘルプ） ==== */}
          <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="mx-auto max-w-7xl px-4 md:px-8">
              {/* モバイルだけ縦積み（重なり回避）/ sm以上は従来どおり横並び */}
              <div className="flex flex-col gap-1 py-1 sm:h-12 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:py-0">
                {/* 左：ブランド（ホームリンク） */}
                <Link
                  href="/"
                  className="inline-flex items-center gap-1 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                  aria-label="ShopWriter ホームへ"
                >
                  {/* ブランドロゴ（アイコン） */}
                  <Logo
                    variant="icon"
                    size="md"
                    className="shrink-0"
                    priority={true}
                  />
                  {/* ブランド名（濃紺で統一） */}
                  <span className="text-[1.05rem] font-semibold tracking-tight text-[#0A1F61]">
                    ShopWriter
                  </span>
                </Link>

                {/* 右：アクション群
                   - モバイル：折り返し禁止（nowrap）＋ 横スクロール
                   - 重要：各アイテムを shrink-0 にして“潰れ”を発生させない
                 */}
                <div className="-mx-2 flex w-full flex-nowrap items-center gap-1 overflow-x-auto px-2 py-1 whitespace-nowrap sm:mx-0 sm:w-auto sm:overflow-visible sm:px-0 sm:py-0">
                  {/* ✅ モバイル：ダッシュボード（短縮ラベル） */}
                  <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    className="sm:hidden px-2 shrink-0 whitespace-nowrap"
                  >
                    <Link href="/dashboard" aria-label="ダッシュボードへ">
                      ダッシュ
                    </Link>
                  </Button>

                  {/* ✅ sm以上：ダッシュボード（従来ラベル） */}
                  <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    className="hidden sm:inline-flex px-2 shrink-0 whitespace-nowrap"
                  >
                    <Link href="/dashboard" aria-label="ダッシュボードへ">
                      ダッシュボード
                    </Link>
                  </Button>

                  {/* ✅ モバイル：共有の使い方（短縮ラベル） */}
                  <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    className="sm:hidden px-2 shrink-0 whitespace-nowrap"
                  >
                    <Link href="/share/guide" aria-label="共有の使い方">
                      共有
                    </Link>
                  </Button>

                  {/* ✅ sm未満で表示：プラン（迷わない入口 / ghost） */}
                  <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    className="sm:hidden px-2 shrink-0 whitespace-nowrap"
                  >
                    <Link
                      href="/pricing"
                      aria-label="プランを見る"
                      className="inline-flex items-center gap-1 whitespace-nowrap"
                    >
                      <Crown className="size-4 shrink-0" />
                      プラン
                    </Link>
                  </Button>

                  {/* md以上で表示：共有の使い方（ghost統一） */}
                  <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    className="hidden md:inline-flex px-2 shrink-0 whitespace-nowrap"
                  >
                    <Link href="/share/guide" aria-label="共有の使い方">
                      共有の使い方
                    </Link>
                  </Button>

                  {/* md以上で表示：プランを見る（主役CTA：現状の強さ維持） */}
                  <Button
                    asChild
                    size="sm"
                    className="hidden md:inline-flex gap-1 shrink-0 whitespace-nowrap"
                    aria-label="プランを見る"
                  >
                    <Link href="/pricing" className="inline-flex items-center gap-1 whitespace-nowrap">
                      <Crown className="size-4 shrink-0" />
                      プランを見る
                    </Link>
                  </Button>

                  {/* ✅ 常時表示：ログイン/ログアウト（潰れ防止で wrapper 固定） */}
                  <div className="shrink-0 whitespace-nowrap">
                    <AuthButton />
                  </div>

                  {/* 常時表示：ヘルプ（ドロップダウン）（潰れ防止で wrapper 固定） */}
                  <div className="shrink-0 whitespace-nowrap">
                    <HelpDropdown />
                  </div>
                </div>
              </div>
            </div>
          </header>

          {/* ==== ページ本体 ==== */}
          <div className="min-h-dvh">{children}</div>

          {/* ==== グローバルフッター（Stripe審査/法務導線） ==== */}
          <footer className="border-t bg-background">
            <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between md:px-8">
              <div>© {new Date().getFullYear()} ShopWriter</div>

              <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <Link
                  href="/support"
                  className="hover:text-foreground underline-offset-4 hover:underline"
                >
                  サポート
                </Link>
                <Link
                  href="/privacy"
                  className="hover:text-foreground underline-offset-4 hover:underline"
                >
                  プライバシーポリシー
                </Link>
                <Link
                  href="/terms"
                  className="hover:text-foreground underline-offset-4 hover:underline"
                >
                  利用規約
                </Link>
                <Link
                  href="/legal/tokushoho"
                  className="hover:text-foreground underline-offset-4 hover:underline"
                >
                  特定商取引法に基づく表記
                </Link>
              </nav>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
