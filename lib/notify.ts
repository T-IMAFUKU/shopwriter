"use client";

/**
 * notify（互換レイヤ）
 * - 既存の import/use を壊さずに、内部実装を appToast に統一
 * - 秒数ポリシー:
 *   - success / info … 2600ms
 *   - warning / error … 4000ms
 * - 位置/色/closeButton は app/providers.tsx の <Toaster> に準拠（右上・richColors・closeButton）
 */

import { appToast } from "@/lib/toast";

export type NotifyOptions = {
  /** 補足説明行（省略可） */
  description?: string;
  /** 自動クローズまでの ms（未指定時はポリシーに準拠） */
  duration?: number;
  /** 任意のID（重複抑止等に使用） */
  id?: string | number;
};

export const notify = {
  /** 成功（2600ms） */
  success(message: string, opts: NotifyOptions = {}) {
    return appToast.success(message, opts);
  },

  /** 情報（2600ms） */
  info(message: string, opts: NotifyOptions = {}) {
    return appToast.info(message, opts);
  },

  /** 警告（4000ms） */
  warn(message: string, opts: NotifyOptions = {}) {
    return appToast.warning(message, opts);
  },

  /** エラー（4000ms） */
  error(message: string, opts: NotifyOptions = {}) {
    return appToast.error(message, opts);
  },

  /**
   * 非同期の統一表現
   * 既存との互換: 呼び出し側は `await notify.promise(p, ... )` と書ける
   * 実装: appToast.promise を走らせつつ、元の Promise<T> をそのまま返す
   */
  promise<T>(
    p: Promise<T>,
    messages: {
      loading: string;
      success: string | ((v: T) => string);
      error: string | ((e: any) => string);
    },
    _opts?: NotifyOptions
  ): Promise<T> {
    // appToast.promise はメッセージを出す副作用だけ担う
    appToast.promise(
      p.then((v) => (typeof messages.success === "function" ? messages.success(v) : messages.success)),
      {
        loading: messages.loading,
        success: typeof messages.success === "string" ? messages.success : "成功しました",
        error: typeof messages.error === "string" ? messages.error : "失敗しました",
      }
    );

    // 互換のため元の Promise<T> を返す（呼び出し側で await 可）
    return p.then(
      (v) => v,
      (e) => {
        // 失敗文言の関数版が渡されている場合は個別に出したいケースもあるため、
        // ここでは追加トーストは出さず、appToast.promise に任せる
        throw e;
      }
    );
  },

  /**
   * クリップボードコピー
   * - 成功: 「コピーしました」（2600ms）
   * - 失敗: 「コピーに失敗しました」（4000ms）
   */
  async copy(text: string, opts?: { success?: string; error?: string } & NotifyOptions) {
    try {
      await navigator.clipboard.writeText(text);
      appToast.success(opts?.success ?? "コピーしました", {
        duration: opts?.duration,
        id: opts?.id,
      });
      return true;
    } catch (e) {
      appToast.error(opts?.error ?? "コピーに失敗しました", {
        duration: opts?.duration,
        id: opts?.id,
      });
      return false;
    }
  },
} as const;

export default notify;

/* --- smoke test（任意） ---
 * ブラウザ Console: window.__notifySmoke?.()
 */
declare global {
  interface Window {
    __notifySmoke?: () => void;
  }
}
if (typeof window !== "undefined") {
  window.__notifySmoke = () => notify.info("notify 起動テスト");
}
