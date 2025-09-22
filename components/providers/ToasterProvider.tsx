"use client";

import * as React from "react";
import { Toaster, toast } from "sonner";

/**
 * ToasterProvider
 * - アプリ全体のトースト基盤（sonner）
 * - 共通の通知ユーティリティ `notify.*` を提供
 *
 * メッセージは i18n なしのシンプル実装（文字化け復旧のため最小限）。
 */

type NotifyInput = {
  title: string;
  description?: string;
  id?: string;
  durationMs?: number;
};

export const notify = {
  success(input: NotifyInput) {
    return toast.success(input.title, {
      id: input.id,
      description: input.description,
      duration: input.durationMs ?? 2500,
    });
  },
  warning(input: NotifyInput) {
    return toast.warning(input.title, {
      id: input.id,
      description: input.description,
      duration: input.durationMs ?? 3500,
    });
  },
  error(input: NotifyInput) {
    return toast.error(input.title, {
      id: input.id,
      description: input.description,
      duration: input.durationMs ?? 4000,
    });
  },
  message(input: NotifyInput) {
    return toast.message(input.title, {
      id: input.id,
      description: input.description,
      duration: input.durationMs ?? 3000,
    });
  },
};

export function ToasterProvider() {
  // App Router layout.tsx で <ToasterProvider /> を1回だけ配置してください
  return <Toaster richColors closeButton position="top-right" />;
}

export default ToasterProvider;
