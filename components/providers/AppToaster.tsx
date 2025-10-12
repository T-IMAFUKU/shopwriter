// components/providers/AppToaster.tsx
"use client";

/**
 * DEPRECATED SHIM — Toaster は app/providers.tsx の 1 箇所に集約しました。
 * 本コンポーネントは後方互換のためだけに残し、描画はしません。
 * 依存箇所は順次削除してください。
 */

import { useEffect } from "react";

export default function AppToaster() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(
        "[DEPRECATED] components/providers/AppToaster は無効です。Toaster は app/providers.tsx に一本化しました。"
      );
    }
  }, []);
  return null;
}
