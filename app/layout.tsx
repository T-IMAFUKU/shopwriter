import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ShopWriter",
  description: "AI-powered product copywriter",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body className={`${inter.className} min-h-dvh bg-background text-foreground antialiased`}>
        <div className="flex min-h-dvh flex-col">
          <header className="border-b">
            <div className="container flex h-14 items-center justify-between">
              <div className="font-semibold">ShopWriter</div>
              <nav className="text-sm text-muted-foreground">
                <a className="hover:underline" href="/writer">Writer</a>
              </nav>
            </div>
          </header>
          <main className="flex-1">{children}</main>
          <footer className="border-t">
            <div className="container py-6 text-xs text-muted-foreground">
              © {new Date().getFullYear()} ShopWriter
            </div>
          </footer>
        </div>
        <Toaster />
      </body>
    </html>
  );
}
