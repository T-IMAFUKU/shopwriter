// app/providers.tsx
"use client";

import * as React from "react";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";

type ProvidersProps = {
  children: React.ReactNode;
};

/**
 * グローバル Provider
 * - Toaster はここ「1か所のみ」にマウント（position=top-right）
 * - 色は classNames.toast の data-[type=...] で切替（success/error/info）
 * - duration は src/lib/notify.ts 側で統一（success=2600ms / error=4000ms / info=2600ms）
 */
export function Providers({ children }: ProvidersProps) {
  return (
    <SessionProvider>
      {children}
      <Toaster
        position="top-right"
        theme="light"
        closeButton
        expand={false}
        // richColors は使わず、淡色は Tailwind で付与
        toastOptions={{
          classNames: {
            // 単一キー "toast" に data-[type=...] でバリアント付与
            toast: [
              "rounded-xl",
              "shadow-md",
              "ring-1 ring-inset",
              "transition-colors",
              // success（淡色エメラルド）
              "data-[type=success]:border-emerald-300",
              "data-[type=success]:bg-emerald-50",
              "data-[type=success]:text-emerald-800",
              "dark:data-[type=success]:bg-emerald-900/30",
              "dark:data-[type=success]:text-emerald-100",
              // error（淡色ローズ）
              "data-[type=error]:border-rose-300",
              "data-[type=error]:bg-rose-50",
              "data-[type=error]:text-rose-800",
              "dark:data-[type=error]:bg-rose-900/30",
              "dark:data-[type=error]:text-rose-100",
              // info（淡色スカイ）
              "data-[type=info]:border-sky-300",
              "data-[type=info]:bg-sky-50",
              "data-[type=info]:text-sky-800",
              "dark:data-[type=info]:bg-sky-900/30",
              "dark:data-[type=info]:text-sky-100",
            ].join(" "),
            title: "text-[13px] font-medium",
            description: "text-[12px] opacity-90",
            actionButton: "rounded-md",
            cancelButton: "rounded-md",
            closeButton: "opacity-70 hover:opacity-100",
          },
        }}
      />
    </SessionProvider>
  );
}
