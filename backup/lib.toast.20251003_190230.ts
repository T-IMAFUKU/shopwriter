// lib/toast.ts
// ※ 直に `sonner` を import せず、通知はすべて src/lib/notify.ts 経由に統一します。

import {
  notify,
  notifySuccess,
  notifyError,
  notifyInfo,
} from "../src/lib/notify";

type Opts = {
  description?: string;
  duration?: number;
  id?: string | number;
};

const DUR = {
  short: 2600, // success / info（既定）
  long: 4000,  // error / warning（長め）
} as const;

export const appToast = {
  // --- 基本バリアント（CUD=成功/失敗/情報）---
  success(title: string, opts: Opts = {}) {
    return notifySuccess(title, {
      description: opts.description,
      duration: opts.duration ?? DUR.short,
      id: opts.id,
    });
  },
  info(title: string, opts: Opts = {}) {
    return notifyInfo(title, {
      description: opts.description,
      duration: opts.duration ?? DUR.short,
      id: opts.id,
    });
  },
  // CUDルール上、warning は「情報色(青)・長め」に寄せる
  warning(title: string, opts: Opts = {}) {
    return notifyInfo(title, {
      description: opts.description,
      duration: opts.duration ?? DUR.long,
      id: opts.id,
    });
  },
  error(title: string, opts: Opts = {}) {
    return notifyError(title, {
      description: opts.description,
      duration: opts.duration ?? DUR.long,
      id: opts.id,
    });
  },

  // --- 非同期系（loading→resolve/rejectで更新）---
  // sonner.promise は使わず、notify の id を使って近似動作にします
  // 返り値は元の Promise と同じ p を返します（呼び出し側の互換性重視）
  promise<T>(
    p: Promise<T>,
    messages: { loading: string; success: string; error: string }
  ) {
    const id = notify(messages.loading, "info", { duration: DUR.long });
    p.then(
      () => notifySuccess(messages.success, { id, duration: DUR.short }),
      () => notifyError(messages.error, { id, duration: DUR.long })
    );
    return p;
  },

  // --- 定型文（日本語）---
  created(name: string, opts: Opts = {}) {
    return notifySuccess(`「${name}」を作成しました`, {
      description: opts.description,
      duration: opts.duration ?? DUR.short,
      id: opts.id,
    });
  },
  updated(name: string, opts: Opts = {}) {
    return notifySuccess(`「${name}」を更新しました`, {
      description: opts.description,
      duration: opts.duration ?? DUR.short,
      id: opts.id,
    });
  },
  deleted(name: string, opts: Opts = {}) {
    return notifySuccess(`「${name}」を削除しました`, {
      description: opts.description,
      duration: opts.duration ?? DUR.short,
      id: opts.id,
    });
  },
  validation(desc?: string, opts: Opts = {}) {
    return notifyInfo("入力内容を確認してください", {
      description: desc ?? opts.description,
      duration: opts.duration ?? DUR.long,
      id: opts.id,
    });
  },
  network(desc?: string, opts: Opts = {}) {
    return notifyError("通信エラーが発生しました", {
      description: desc ?? opts.description,
      duration: opts.duration ?? DUR.long,
      id: opts.id,
    });
  },
  failure(desc?: string, opts: Opts = {}) {
    return notifyError("エラーが発生しました", {
      description: desc ?? opts.description,
      duration: opts.duration ?? DUR.long,
      id: opts.id,
    });
  },
};

export type AppToast = typeof appToast;
