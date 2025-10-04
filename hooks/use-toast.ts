// hooks/use-toast.ts
// 旧API（notifySuccess/notifyError/notifyInfo/notifySaved）を撤去し、notifyに一本化。

import notify from "../src/lib/notify";

export const useToast = () => {
  return {
    toast: notify, // 互換用
    notify,        // 推奨
  };
};

// 互換エイリアス（既存コードの toast 利用を許容）
export const toast = notify;

// 型の再エクスポート（必要に応じて利用可能）
export type { NotifyKind, NotifyOptions } from "../src/lib/notify";
