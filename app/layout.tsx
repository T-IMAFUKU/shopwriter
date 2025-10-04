// app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "./providers"; // ← named import に統一（providers側にToaster内包）

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ShopWriter",
  description: "AI-powered e-commerce copywriting tool",
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
