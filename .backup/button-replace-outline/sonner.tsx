// components/ui/sonner.tsx
"use client";

/**
 * DEPRECATED SHIM
 * Toaster のマウントは app/providers.tsx に一本化しました。
 * 本ファイルは後方互換シムとして残し、描画は行いません。
 * 依存箇所は順次削除してください。
 */

import { useEffect } from "react";

export function SonnerToasterShim() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(
        "[DEPRECATED] `@/components/ui/sonner` は使用停止です。Toaster は app/providers.tsx に集約しました。"
      );
    }
  }, []);
  return null;
}

// デフォルトエクスポートを残す（後方互換）
export default SonnerToasterShim;

