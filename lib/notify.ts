"use client";

// lib/notify.ts
// -----------------------------------------------------------------------------
// Unified notify helper (sonner/appToast 互換)
// - 関数: notify("message", "info" | "success" | "warn" | "error", opts?)
// - メソッド: notify.success/info/warn/error
// - promise: notify.promise(promise, { loading, success, error })
// - copy: notify.copy(text, { success?, error?, duration?, id? })
//   ※ 既存の import/use を壊さない前提で、callable も追加。
// -----------------------------------------------------------------------------

import { appToast } from "@/lib/toast";

export type NotifyKind = "success" | "info" | "warn" | "error";

export type NotifyOptions = {
  description?: string;
  duration?: number;
  id?: string | number;
};

// appToast の実装差（warning / warn / 無し）を吸収
function emit(kind: NotifyKind, message: string, opts?: NotifyOptions) {
  const t: any = appToast as any;
  switch (kind) {
    case "success":
      return t.success?.(message, opts) ?? t(message, opts);
    case "info":
      return t.info?.(message, opts) ?? t(message, opts);
    case "warn":
      // sonner 世代により warning or warn が分かれる
      return t.warning?.(message, opts) ?? t.warn?.(message, opts) ?? t(message, opts);
    case "error":
      return t.error?.(message, opts) ?? t(message, opts);
    default:
      return t(message, opts);
  }
}

// 本体: 関数 + メソッドを併存
export const notify = Object.assign(
  (message: string, kind: NotifyKind = "info", opts?: NotifyOptions) => emit(kind, message, opts),
  {
    success: (message: string, opts?: NotifyOptions) => emit("success", message, opts),
    info: (message: string, opts?: NotifyOptions) => emit("info", message, opts),
    warn: (message: string, opts?: NotifyOptions) => emit("warn", message, opts),
    error: (message: string, opts?: NotifyOptions) => emit("error", message, opts),

    // 非同期トースト（表示は appToast 側に委譲しつつ Promise<T> をそのまま返す）
    async promise<T>(
      p: Promise<T>,
      messages: {
        loading: string;
        success: string | ((v: T) => string);
        error: string | ((e: any) => string);
      },
      _opts?: NotifyOptions
    ): Promise<T> {
      const t: any = appToast as any;
      // appToast.promise がない場合もあるのでフォールバック
      if (t.promise) {
        t.promise(
          p.then((v: T) => (typeof messages.success === "function" ? messages.success(v) : messages.success)),
          {
            loading: messages.loading,
            success: typeof messages.success === "string" ? messages.success : "成功しました",
            error: typeof messages.error === "string" ? messages.error : "失敗しました",
          }
        );
      } else {
        emit("info", messages.loading);
        p.then(
          (v) => emit("success", typeof messages.success === "function" ? messages.success(v) : messages.success),
          (e) => emit("error", typeof messages.error === "function" ? messages.error(e) : messages.error)
        );
      }
      return p;
    },

    // クリップボードコピー（成功=2600ms / 失敗=4000ms 想定を尊重）
    async copy(text: string, opts?: { success?: string; error?: string } & NotifyOptions) {
      try {
        await navigator.clipboard.writeText(text);
        emit("success", opts?.success ?? "コピーしました", { duration: opts?.duration, id: opts?.id });
        return true;
      } catch (e) {
        emit("error", opts?.error ?? "コピーに失敗しました", { duration: opts?.duration, id: opts?.id });
        return false;
      }
    },
  }
);

export type NotifyFn = typeof notify;
export default notify;

// --- smoke test（任意） ---
declare global {
  interface Window {
    __notifySmoke?: () => void;
  }
}
if (typeof window !== "undefined") {
  window.__notifySmoke = () => notify("notify 起動テスト", "info");
}
