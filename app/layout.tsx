import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Providers } from "./providers"; // providers側にToaster内包
import dynamic from "next/dynamic";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Crown } from "lucide-react";

// ===== グローバル・ヘルプ（遅延なしで安定読込）
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
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
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
          {/* ==== グローバルヘッダー（ブランド＋CTA＋ヘルプ） ==== */}
          <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="mx-auto max-w-7xl px-4 md:px-8">
              <div className="flex h-12 items-center justify-between gap-3">
                {/* 左：ブランド（ホームリンク） */}
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                  aria-label="ShopWriter ホームへ"
                >
                  <span className="inline-grid size-6 place-items-center rounded-md bg-indigo-600 text-white text-[11px] font-bold">
                    SW
                  </span>
                  <span className="text-sm font-semibold tracking-tight">
                    ShopWriter
                  </span>
                </Link>

                {/* 右：アクション群 */}
                <div className="flex items-center gap-2">
                  {/* md以上で表示：共有の使い方 */}
                  <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    className="hidden md:inline-flex"
                  >
                    <Link href="/share/guide" aria-label="共有の使い方">
                      共有の使い方
                    </Link>
                  </Button>

                  {/* md以上で表示：プランを見る */}
                  <Button
                    asChild
                    size="sm"
                    className="hidden md:inline-flex gap-1"
                    aria-label="プランを見る"
                  >
                    <Link href="/pricing">
                      <Crown className="size-4" />
                      プランを見る
                    </Link>
                  </Button>

                  {/* 常時表示：ヘルプ（ドロップダウン） */}
                  <HelpDropdown />
                </div>
              </div>
            </div>
          </header>

          {/* ==== ページ本体 ==== */}
          {children}
        </Providers>
      </body>
    </html>
  );
}

