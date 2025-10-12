// components/ui/toaster.tsx
"use client";

/**
 * DEPRECATED SHIM
 * グローバル Toaster は app/providers.tsx 内で 1つだけマウントします。
 * 本ファイルは後方互換シムとして残し、描画は行いません（重複を防ぐ）。
 * 依存箇所は順次削除してください。
 */

import { useEffect } from "react";

export function Toaster() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(
        "[DEPRECATED] `@/components/ui/toaster` は使用停止です。Toaster は app/providers.tsx に集約しました。"
      );
    }
  }, []);
  return null;
}

export default Toaster;
