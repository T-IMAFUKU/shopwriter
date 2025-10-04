"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

/**
 * デザイン方針
 * - Overlay: コーポレートネイビー基調の半透明グラデ＋ぼかし（CUD配慮）
 * - Content: iOS系グラス感（rounded-3xl / 背景透過 / backdrop-blur）
 * - z-index: Overlay < Content < Toaster(sonner既定: 9999想定)
 *   → Overlay: z-40 / Content: z-50 に固定して、トーストが確実に前面に来るよう調整
 */

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogPortal = DialogPrimitive.Portal;

/** Overlay（黒ベタ撤廃 → ネイビーグラデ＋ぼかし） */
export const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(function DialogOverlay({ className, style, ...props }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      data-radix-dialog-overlay=""
      className={[
        // レイアウト（※ z-index は 40 に固定）
        "fixed inset-0 z-40",
        // コーポレートネイビー基調（CUD配慮のグラデで単色つぶれ回避）
        "bg-gradient-to-br from-[#0A2540]/70 to-[#1E3A5F]/60",
        // ぼかし（対応環境では強めに）
        "backdrop-blur-md supports-[backdrop-filter]:backdrop-blur-xl",
        // アニメーション
        "data-[state=open]:animate-in data-[state=open]:fade-in-0",
        "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
        className ?? "",
      ].join(" ")}
      style={style}
      {...props}
    />
  );
});

/** Content（グラス感＋スムースアニメ） */
export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(function DialogContent({ className, children, style, ...props }, ref) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        data-radix-dialog-content=""
        className={[
          // 位置・層（※ z-index は 50 に固定）
          "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
          // ベース
          "grid w-full max-w-lg gap-4 p-6",
          // グラスモーフィズム
          "rounded-3xl border border-white/15 dark:border-white/10",
          "bg-white/70 dark:bg-neutral-900/70",
          "text-neutral-900 dark:text-neutral-100",
          "shadow-[0_10px_40px_-12px_rgba(0,0,0,0.35)]",
          "supports-[backdrop-filter]:backdrop-blur-xl",
          // アニメーション
          "duration-200",
          "data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-top-2",
          "data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=closed]:slide-out-to-top-1",
          // フォーカス
          "focus:outline-none",
          className ?? "",
        ].join(" ")}
        style={style}
        {...props}
      >
        {children}

        {/* 右上 Close */}
        <DialogPrimitive.Close
          className={[
            "absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center",
            "rounded-full opacity-70 transition-opacity hover:opacity-100",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            "focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "disabled:pointer-events-none",
          ].join(" ")}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});

export function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={["flex flex-col space-y-1.5 text-center sm:text-left", className ?? ""].join(" ")}
      {...props}
    />
  );
}

export function DialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={[
        "mt-6 flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
        className ?? "",
      ].join(" ")}
      {...props}
    />
  );
}

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function DialogTitle({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={["text-[17px] font-semibold tracking-tight leading-none", className ?? ""].join(
        " "
      )}
      {...props}
    />
  );
});

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function DialogDescription({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={["text-sm text-muted-foreground", className ?? ""].join(" ")}
      {...props}
    />
  );
});
