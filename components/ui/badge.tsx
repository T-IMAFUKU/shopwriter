// components/ui/badge.tsx  ———— 〈全文置換〉
"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Tailwind v4 対応:
 * - 旧トークン（bg-primary 等）ではなく任意値クラスで変数参照
 * - コメントに 'border-border' を含めない（誤検知防止）
 */
export const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors " +
    "focus:outline-none focus:ring-2 focus:ring-offset-2 " +
    "disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        default:
          "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border-transparent",
        secondary:
          "bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] border-transparent",
        destructive:
          "bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] border-transparent",
        outline:
          "bg-transparent text-[hsl(var(--foreground))] border-[hsl(var(--border))]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export default Badge;

