"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Button variants（ShopWriter統一仕様）
 * ----------------------------------------------------------
 * - primary   : CIネイビー（brand）基準。bg-primary/text-primary-foreground。
 * - secondary : 補助ボタン。bg-secondary/text-foreground。
 * - ghost     : 枠なし（hoverで薄い面）。
 * ----------------------------------------------------------
 * 既定: variant="primary" / size="md"
 */
export const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium " +
    "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 " +
    "disabled:pointer-events-none disabled:opacity-60 ring-offset-background select-none",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground shadow-soft hover:bg-primary/90 active:scale-[0.98]",
        secondary:
          "bg-secondary text-foreground border border-border shadow-soft hover:bg-secondary/80 active:scale-[0.98]",
        ghost:
          "bg-transparent text-foreground hover:bg-secondary/60 active:bg-secondary/70",
      },
      size: {
        sm: "h-9 px-3 text-sm",
        md: "h-[var(--btn-h,2.5rem)] px-[var(--btn-px,1rem)]",
        lg: "h-11 px-5 text-[0.95rem] rounded-lg",
        icon: "h-10 w-10",
      },
      asChild: { true: "", false: "" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

/** 標準Button（asChildでLink等に適用可能） */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref as any}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
export { Button };

/* =========================================================
   Motion対応（完全フォールバック版）
   - framer-motion を参照しません。常に通常Buttonとして振る舞います。
   - 既存の import { MotionButton } from "@/components/ui/button" はそのまま有効です。
   ========================================================= */
export const MotionButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => (
    <Button
      ref={ref}
      className={className}
      variant={variant}
      size={size}
      asChild={asChild}
      {...props}
    />
  )
);
MotionButton.displayName = "MotionButton";
