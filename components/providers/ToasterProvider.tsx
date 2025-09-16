"use client";

import * as React from "react";
import { Toaster, toast } from "sonner";

/**
 * ShopWriter - Toast 統一ルール
 * - 成功:   緑 / 短め (2.0s)     → notify.success()
 * - 警告:   黄 / 中間 (3.5s)     → notify.warning()
 * - 失敗:   赤 / 長め (5.0s)     → notify.error()
 * - 情報:   既定 (3.0s)          → notify.info()
 *
 * アクセシビリティ:
 * - Toaster は aria-live polite を内部で使用（画面読み上げ対応）
 * - タイトルは簡潔、説明は任意。行動ボタンは actionLabel/onAction を統一。
 */

type NotifyInput =
  | string
  | {
      title?: string;
      description?: string;
      /** 既定: success=2000, warning=3500, error=5000, info=3000 */
      duration?: number;
      /** 任意の一意ID（重複抑止に使用可） */
      id?: string | number;
      /** ボタン文言（例: "取り消し"） */
      actionLabel?: string;
      /** ボタン押下時ハンドラ */
      onAction?: () => void;
    };

type Built = {
  title: string;
  description?: string;
  duration: number;
  id?: string | number;
  action?: { label: string; onClick: () => void } | undefined;
};

function build(input: NotifyInput, fallbackTitle: string, defaultDuration: number): Built {
  if (typeof input === "string") {
    return { title: input, duration: defaultDuration };
  }
  const title = input.title || fallbackTitle;
  const duration = input.duration ?? defaultDuration;
  const action =
    input.actionLabel && input.onAction
      ? { label: input.actionLabel, onClick: input.onAction }
      : undefined;

  return {
    title,
    description: input.description,
    duration,
    id: input.id,
    action,
  };
}

/** Sonner は warning をサポート（バージョンによっては .warning が無い場合に備えてフォールバック） */
const hasWarning = (toast as any).warning instanceof Function;

const notify = {
  /** 成功: 緑 / 2.0s */
  success(input: NotifyInput) {
    const b = build(input, "完了しました", 2000);
    toast.success(b.title, {
      id: b.id,
      description: b.description,
      duration: b.duration,
      action: b.action,
    });
  },
  /** 警告: 黄 / 3.5s */
  warning(input: NotifyInput) {
    const b = build(input, "ご確認ください", 3500);
    if (hasWarning) {
      (toast as any).warning(b.title, {
        id: b.id,
        description: b.description,
        duration: b.duration,
        action: b.action,
      });
    } else {
      // フォールバック: 黄トーン風の className 付与（richColors と併用可）
      toast.message(b.title, {
        id: b.id,
        description: b.description,
        duration: b.duration,
        action: b.action,
        className:
          "bg-yellow-500 text-white dark:bg-yellow-500/90 dark:text-white",
      });
    }
  },
  /** 失敗: 赤 / 5.0s */
  error(input: NotifyInput) {
    const b = build(input, "エラーが発生しました", 5000);
    toast.error(b.title, {
      id: b.id,
      description: b.description,
      duration: b.duration,
      action: b.action,
    });
  },
  /** 情報: 既定 / 3.0s */
  info(input: NotifyInput) {
    const b = build(input, "お知らせ", 3000);
    toast.message(b.title, {
      id: b.id,
      description: b.description,
      duration: b.duration,
      action: b.action,
    });
  },
};

/**
 * グローバル手動発火（検証用）
 * - DevTools から: window.__notify.success("コピーしました")
 * - 本番でも害はないが、将来的にフラグで制御可
 */
function exposeToWindow() {
  if (typeof window !== "undefined") {
    // @ts-expect-error - 動的プロパティ
    window.__notify = notify;
  }
}

exposeToWindow();

export function useNotify() {
  return React.useMemo(() => notify, []);
}

/**
 * 既存の Provider を置換え
 * - アプリ共通で Toaster を 1 箇所に集約
 * - richColors / closeButton を有効化
 * - 位置は UX 認知負荷の低い "top-right"
 */
export default function ToasterProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <Toaster
        position="top-right"
        richColors
        closeButton
        toastOptions={{
          // グローバル既定（各通知で上書き）
          duration: 3000,
        }}
      />
    </>
  );
}
