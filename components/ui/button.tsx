// components/ui/button.tsx  ————— 〈全文置換〉
"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Button のベースに `.ui-btn` を必ず付与。
 * 角丸・影・余白（密度）は CSS トークン `.ui-btn` に委譲する。
 * ここでは「サイズ（高さ・左右余白）」と軽い状態変化のみを担当。
 */
export const buttonVariants = cva(
  // ★ `.ui-btn` を最優先で付与（角丸/影/密度トークンを全ボタンに適用）
  "ui-btn inline-flex items-center justify-center font-medium transition-colors " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 " +
    "disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      /**
       * 色・見た目の大枠は `.ui-btn` 側で吸収する想定。
       * ここでは必要最小限だけを付与（outline/link/ghost など）。
       */
      variant: {
        default: "",
        secondary: "",
        destructive: "",
        outline: "border",
        ghost: "",
        link: "underline underline-offset-4 hover:no-underline",
      },
      /**
       * 高さ・左右余白のみ。角丸・影は `.ui-btn` に統一。
       */
      size: {
        default: "h-9 px-4 text-sm",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-6 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

/**
 * 既存の shadcn Button と同じ API。
 * asChild=true で Slot によるラッパーも可能。
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export default Button;
