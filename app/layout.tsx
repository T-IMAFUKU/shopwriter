import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ToasterProvider } from "@/components/providers/ToasterProvider";

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
    <html lang="ja">
      <body className={inter.className}>
        {children}
        {/* グローバルに Toaster を1つだけ配置 */}
        <ToasterProvider />
      </body>
    </html>
  );
}
