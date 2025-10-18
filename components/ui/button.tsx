"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Button 統一方針
 * - 角丸：rounded-* は Tailwind の theme.borderRadius を参照（--radius-* / --ui-radius-* フォールバック）
 * - 影   ：shadow-soft / shadow-soft-md は globals.css の CSS 変数（--shadow-*）を参照
 * - 高さ/余白：--btn-h / --btn-px / --btn-py を使用（globals.css）
 *
 * Variant:
 *  - primary     : brand基準（bg-primary / text-primary-foreground）
 *  - secondary   : サブ（bg-secondary / text-foreground）
 *  - outline     : 背景透過＋枠線（hoverで薄い背景）
 *  - ghost       : 完全透過（hoverで薄い背景）
 *  - success     : 成功系（Toast/ダッシュボード用）
 *  - destructive : 危険操作
 *  - link        : リンク風（下線）
 *
 * Size:
 *  - sm / md / lg / icon
 */

export const buttonVariants = cva(
  [
    "inline-flex items-center justify-center whitespace-nowrap",
    "text-sm font-medium",
    "transition-[background-color,color,box-shadow,filter,transform] duration-150",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
    "ring-offset-background select-none",
    "disabled:pointer-events-none disabled:opacity-60",
    // 角丸（md を基準、サイズ差分で sm / lg を変更）
    "rounded-md",
  ].join(" "),
  {
    variants: {
      variant: {
        primary: [
          "bg-primary text-primary-foreground",
          "shadow-soft",
          "hover:bg-primary/90 active:scale-[0.98]",
        ].join(" "),
        secondary: [
          "bg-secondary text-foreground",
          "border border-border shadow-soft",
          "hover:bg-secondary/80 active:scale-[0.98]",
        ].join(" "),
        outline: [
          "bg-transparent text-foreground",
          "border border-border shadow-soft",
          "hover:bg-secondary/60 active:bg-secondary/70",
        ].join(" "),
        ghost: [
          "bg-transparent text-foreground",
          "hover:bg-secondary/60 active:bg-secondary/70",
        ].join(" "),
        success: [
          "bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]",
          "shadow-soft",
          "hover:bg-[hsl(var(--success))/0.9] active:scale-[0.98]",
        ].join(" "),
        destructive: [
          "bg-destructive text-destructive-foreground",
          "shadow-soft",
          "hover:bg-destructive/90 active:scale-[0.98]",
        ].join(" "),
        link: [
          "bg-transparent underline-offset-4 hover:underline",
          "text-primary",
        ].join(" "),
      },
      size: {
        sm: [
          "h-9",
          "px-3",
          "rounded-sm", // → --radius-sm を参照（tailwind.config 経由）
        ].join(" "),
        md: [
          "h-[var(--btn-h)]",
          "px-[var(--btn-px)] py-[var(--btn-py)]",
          "rounded-md",
        ].join(" "),
        lg: [
          "h-11",
          "px-5",
          "text-[0.95rem]",
          "rounded-lg", // → --radius-lg を参照
        ].join(" "),
        icon: [
          "h-10 w-10",
          "rounded-md",
        ].join(" "),
      },
      asChild: {
        true: "",
        false: "",
      },
      elevated: {
        // CTAなど一段強い影を使いたいケース用（任意）
        true: "shadow-soft-md",
        false: "",
      },
    },
    compoundVariants: [
      // outline/ghost/link に elevated を指定しても違和感が出ないよう box-shadow のみ追加
      { variant: "outline", elevated: true, class: "shadow-soft-md" },
      { variant: "ghost", elevated: true, class: "shadow-soft-md" },
      { variant: "link", elevated: true, class: "shadow-soft-md" },
    ],
    defaultVariants: {
      variant: "primary",
      size: "md",
      elevated: false,
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

/**
 * 標準Button
 * - `asChild` で Slot 経由にすれば <Link> 等にも適用可能
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, elevated, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref as any}
        className={cn(buttonVariants({ variant, size, elevated, className }))}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
export { Button };

/* =========================================================
   Motion対応ボタン（任意）
   - import { MotionButton } from "@/components/ui/button"
   - Framer Motion が無い環境でも型崩れしないフォールバック
   ========================================================= */

type MotionLike = React.ComponentType<any> | null;
let motionButton: MotionLike = null;
try {
  // framer-motion が存在する場合のみ読み込み
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { motion } = require("framer-motion");
  motionButton = motion.button;
} catch {
  motionButton = null;
}

export const MotionButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, elevated, asChild = false, ...props }, ref) => {
    if (!motionButton || asChild) {
      // framer-motion が無い or Slot利用時は通常Buttonにフォールバック
      return (
        <Button
          ref={ref}
          className={className}
          variant={variant}
          size={size}
          elevated={elevated}
          asChild={asChild}
          {...props}
        />
      );
    }
    const M = motionButton;
    return (
      <M
        ref={ref as any}
        className={cn(buttonVariants({ variant, size, elevated, className }))}
        whileTap={{ scale: 0.98 }}
        whileHover={{ filter: "brightness(0.98)" }}
        transition={{ duration: 0.12 }}
        {...props}
      />
    );
  }
);
MotionButton.displayName = "MotionButton";
