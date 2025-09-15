// app/layout.tsx
"use client";

import "./globals.css";
import { useEffect } from "react";
import { Toaster, toast } from "sonner";

/**
 * 目的：
 * - 共有ページなどから window.sonnerToast.success/error を呼べるようにブリッジを提供
 * - Toaster を全ページ共通で設置（右上表示）
 *
 * 注意：
 * - 本レイアウトはクライアントコンポーネント化しています。
 *   もし pages 内で metadata を使っていた場合は、必要に応じて
 *   ルートやページ側で export const metadata を定義してください。
 */

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // ブリッジ: window.sonnerToast を登録
  useEffect(() => {
    // 既に登録済みなら上書きせず終了
    if ((window as any).sonnerToast) return;

    (window as any).sonnerToast = {
      success: (msg: string, opt?: any) => {
        try {
          toast.success(msg, { duration: 1600, ...opt });
        } catch {}
      },
      error: (msg: string, opt?: any) => {
        try {
          toast.error(msg, { duration: 1800, ...opt });
        } catch {}
      },
    };
  }, []);

  return (
    <html lang="ja">
      <body>
        {children}
        {/* 全ページ共通のトースト（右上 / リッチカラー） */}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
