"use client";

import { toast as sonnerToast, type ExternalToast } from "sonner";

/**
 * 互換ラッパー：
 * - 受け取り方１：toast("title", { description })
 * - 受け取り方２：toast({ title, description })  ← 古い呼び方も許容し sonner 形式に変換
 */

type LegacyArg = { title?: string; description?: string };

/** 呼び出しシグネチャを包括 */
type ToastArg =
  | string
  | LegacyArg;

type ToastOpts = Omit<ExternalToast, "description"> & { description?: string };

function toastCompat(arg: ToastArg, opts?: ToastOpts) {
  // 文字列ならそのまま sonner へ
  if (typeof arg === "string") {
    return sonnerToast(arg, { ...opts, description: opts?.description });
  }

  // オブジェクト（旧API互換）なら title/description を抽出して sonner 形式へ
  const title = arg.title ?? "";
  const description = arg.description ?? "";

  // title も description も空のときは何も出さない
  if (!title && !description) return;

  // title が無ければ description をタイトルとして表示（視認性のため）
  if (!title && description) {
    return sonnerToast(description, { ...opts });
  }

  // 通常：title + description
  return sonnerToast(title, { ...opts, description });
}

/** useToast フック：shadcn 風の使い心地を維持 */
export function useToast() {
  return { toast: toastCompat };
}

/** 直接 import して使いたい場合用 */
export const toast = toastCompat;
