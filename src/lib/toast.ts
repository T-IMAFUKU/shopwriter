// src/lib/toast.ts
// すべて src/lib/notify.ts 経由でトーストを出す。
// ここでは notify の受け口に合わせて、余計な引数を渡さない（id は使わない）。
// promise も 2 引数シグネチャに統一する。

import notify from "./notify";

type Opts = {
  description?: string;
  duration?: number;
};

const DUR = {
  short: 2600, // success / info（既定）
  long: 4000,  // error / warn（長め）
} as const;

export const appToast = {
  // --- 基本バリアント ---
  success(title: string, opts: Opts = {}) {
    return notify.success(title, {
      description: opts.description,
      duration: opts.duration ?? DUR.short,
    });
  },
  info(title: string, opts: Opts = {}) {
    return notify.info(title, {
      description: opts.description,
      duration: opts.duration ?? DUR.short,
    });
  },
  warn(title: string, opts: Opts = {}) {
    return notify.warn(title, {
      description: opts.description,
      duration: opts.duration ?? DUR.long,
    });
  },
  error(title: string, opts: Opts = {}) {
    return notify.error(title, {
      description: opts.description,
      duration: opts.duration ?? DUR.long,
    });
  },

  // --- 非同期（toast.promise 透過） ---
  // 呼び出し例: appToast.promise(fetch(...), { loading:"...", success:"...", error:"..." })
  promise<T>(
    p: Promise<T>,
    messages: { loading: string; success: string; error: string }
  ) {
    return notify.promise(p, messages);
  },

  // --- 日本語定型 ---
  created(name: string, opts: Opts = {}) {
    return this.success(`「${name}」を作成しました`, opts);
  },
  updated(name: string, opts: Opts = {}) {
    return this.success(`「${name}」を更新しました`, opts);
  },
  deleted(name: string, opts: Opts = {}) {
    return this.success(`「${name}」を削除しました`, opts);
  },
  validation(desc?: string, opts: Opts = {}) {
    return this.warn("入力内容を確認してください", {
      ...opts,
      description: desc ?? opts.description,
    });
  },
  network(desc?: string, opts: Opts = {}) {
    return this.error("通信エラーが発生しました", {
      ...opts,
      description: desc ?? opts.description,
    });
  },
  failure(desc?: string, opts: Opts = {}) {
    return this.error("エラーが発生しました", {
      ...opts,
      description: desc ?? opts.description,
    });
  },
};

export type AppToast = typeof appToast;
