"use client";

/**
 * useToast フック（notify.ts 経由に一本化・相対パス版）
 * - sonner を直接 import せず、src/lib/notify.ts に統一
 * - 右上固定／CUD淡色／duration（成功=2600ms, 失敗=4000ms）は notify 側で担保
 * - エイリアス解決の揺れを避けるため、相対パス（../src/lib/notify）を使用
 */

import {
  notify,
  notifySuccess,
  notifyError,
  notifyInfo,
  notifySaved,
} from "../src/lib/notify";

export function useToast() {
  return {
    toast: notify, // 旧API互換
    notify,
    notifySuccess,
    notifyError,
    notifyInfo,
    notifySaved,
  };
}

// 直接 import 用（旧互換）
export const toast = notify;
