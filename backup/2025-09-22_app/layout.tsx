// app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import * as React from "react";
import ToasterProvider from "@/components/providers/ToasterProvider";

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
      <body>
        <ToasterProvider>{children}</ToasterProvider>
      </body>
    </html>
  );
}


