"use client";

import { useEffect } from "react";

/**
 * @deprecated
 * グローバル Toaster は app/providers.tsx に統合されました。
 * 本コンポーネントは後方互換のため残置していますが、描画はしません。
 * 参照箇所は順次削除してください。
 */
export function ToasterProvider() {
  // 開発時にだけ警告（本番では何もしない）
  if (process.env.NODE_ENV !== "production") {
    useEffect(() => {
      // eslint-disable-next-line no-console
      console.warn(
        "[ToasterProvider] deprecated: Toaster is now provided globally in app/providers.tsx"
      );
    }, []);
  }
  return null;
}
