"use client";

/**
 * hooks/use-toast.ts
 * 旧API（notifySuccess/notifyError/notifyInfo/notifySaved）を撤去し、notify に一本化。
 * 互換のため `toast` も同じ実装を名前付きエクスポートします。
 * `app/page.tsx` などが `import { notify } from "@/hooks/use-toast"` を前提としているため、
 * トップレベルで `export const notify` を必ず提供します。
 */

import _notify from "../src/lib/notify";

// ✅ 既存コード互換：名前付きエクスポート（どちらでも同じ実装）
export const notify = _notify;
export const toast = _notify;

// 任意のカスタムフック形式（必要なら使用可能）
export const useToast = () => ({ notify: _notify, toast: _notify });

// 型の再エクスポート（必要に応じて利用可能）
export type { NotifyKind, NotifyOptions } from "../src/lib/notify";

// （あっても害はない）デフォルトエクスポート：import notify from "@/hooks/use-toast" も可
export default _notify;
