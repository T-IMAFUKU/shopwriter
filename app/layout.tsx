import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Providers } from "./providers"; // providers側にToaster内包

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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
