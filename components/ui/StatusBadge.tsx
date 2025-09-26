"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { radius, spacing } from "@/lib/ui/tokens";

type StatusKind = "success" | "warn" | "info" | "neutral";

/**
 * StatusBadge
 * - 小さめのピル型バッジを統一（public/draft 等）
 * - 角丸/余白は tokens を使用
 * - 用途：カード右上やテーブルの状態表示
 */
export type StatusBadgeProps = {
  kind: StatusKind;
  children?: React.ReactNode; // ラベル文字列（例: "public"）
  className?: string;
  "aria-label"?: string;
};

const KIND_CLASS: Record<StatusKind, string> = {
  success: "bg-emerald-600 text-white",
  warn: "bg-amber-500 text-white",
  info: "bg-blue-600 text-white",
  neutral: "bg-muted text-foreground",
};

export default function StatusBadge({
  kind,
  children,
  className,
  ...rest
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        // 見た目の統一（小バッジ：text-xs / ピル型 / 横詰め）
        "inline-flex items-center text-xs font-medium leading-none",
        KIND_CLASS[kind],
        radius.lg,      // rounded-2xl 相当
        "px-2 py-1",    // spacing.xs より少し大きめを固定
        className
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
