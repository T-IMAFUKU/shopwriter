"use client";

import { toast, type ExternalToast } from "sonner";

/**
 * notify: sonner の薄いラッパー
 * - 統一API: success / info / warn / error / promise / copy
 * - A11y: sonner 側のロール/アナウンスに依存（ToasterProvider 配置済み前提）
 */

export type NotifyOptions = ExternalToast & {
  /** 自動クローズまでのms（0は自動クローズ無効） */
  duration?: number;
};

export const notify = {
  success(message: string, opts?: NotifyOptions) {
    return toast.success(message, opts);
  },
  info(message: string, opts?: NotifyOptions) {
    // 一部バージョンで toast.message が未定義なため base を使用
    return toast(message, opts);
  },
  warn(message: string, opts?: NotifyOptions) {
    return toast.warning(message, opts);
  },
  error(message: string, opts?: NotifyOptions) {
    return toast.error(message, opts);
  },

  /**
   * 非同期の統一表現（自前実装）
   * 例) await notify.promise(fetch(...), { loading:"保存中…", success:"保存しました", error:"失敗しました" })
   */
  async promise<T>(
    p: Promise<T>,
    messages: {
      loading: string;
      success: string | ((v: T) => string);
      error: string | ((e: any) => string);
    },
    opts?: NotifyOptions
  ): Promise<T> {
    const id = toast.loading(messages.loading, opts);
    try {
      const v = await p;
      const okMsg = typeof messages.success === "function" ? messages.success(v) : messages.success;
      toast.dismiss(id);
      toast.success(okMsg, opts);
      return v;
    } catch (e) {
      const ngMsg = typeof messages.error === "function" ? messages.error(e) : messages.error;
      toast.dismiss(id);
      toast.error(ngMsg, opts);
      throw e;
    }
  },

  /**
   * クリップボードに文字列をコピーして成功/失敗をトースト
   */
  async copy(text: string, opts?: { success?: string; error?: string } & NotifyOptions) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(opts?.success ?? "コピーしました", opts);
      return true;
    } catch (e) {
      toast.error(opts?.error ?? "コピーに失敗しました", opts);
      return false;
    }
  },
} as const;

export default notify;

/* --- smoke test (任意) ---
 * 実行方法: ブラウザ Console で window.__notifySmoke?.()
 */
declare global {
  interface Window {
    __notifySmoke?: () => void;
  }
}
if (typeof window !== "undefined") {
  window.__notifySmoke = () => toast.success("notify 起動テスト（sonner）");
}
