/* eslint-disable react/no-unescaped-entities */
"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

/**
 * StatusBadge
 * - ShareCard からは intent: "success" | "warn" を使用
 * - 追加で "info" | "neutral" | "error" もサポート
 * - アクセシビリティ：視覚的ラベル + 任意の sr-only ラベル
 *
 * 使用例：
 *   <StatusBadge intent="success">Public</StatusBadge>
 *   <StatusBadge intent="warn" srLabel="下書き">Draft</StatusBadge>
 */

function cn(...classes: Array<string | undefined | false | null>) {
  return classes.filter(Boolean).join(" ");
}

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium select-none",
  {
    variants: {
      intent: {
        success:
          // 緑系
          "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-900/25 dark:text-emerald-300",
        warn:
          // 黄系
          "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/25 dark:text-amber-200",
        info:
          // 青系
          "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/50 dark:bg-sky-900/25 dark:text-sky-300",
        neutral:
          // グレー系
          "border-neutral-200 bg-neutral-50 text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900/40 dark:text-neutral-300",
        error:
          // 赤系
          "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-900/25 dark:text-red-300",
      },
      size: {
        sm: "px-2 py-0.5 text-[11px]",
        md: "px-2.5 py-0.5 text-xs",
      },
    },
    defaultVariants: {
      intent: "neutral",
      size: "md",
    },
  }
);

export type StatusBadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants> & {
    /** 画面リーダ向けの補足（任意） */
    srLabel?: string;
  };

export function StatusBadge({
  className,
  intent,
  size,
  srLabel,
  children,
  ...rest
}: StatusBadgeProps) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(badgeVariants({ intent, size }), className)}
      {...rest}
    >
      {srLabel ? <span className="sr-only">{srLabel}</span> : null}
      {children}
    </span>
  );
}

/** named / default 両対応（既存互換） */
export default StatusBadge;

