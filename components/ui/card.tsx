"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Card コンポーネント（統一ルール）
 * - 角丸：rounded-* は Tailwind theme.borderRadius → --radius-* / --ui-radius-* に連動
 * - 影  ：shadow-soft / shadow-soft-md（globals.css の --shadow-*）に統一
 * - 配色：bg-card / text-card-foreground（brandトークン整合）
 * - 余白：p-6 を基準（globals.css の spacing と整合）
 */

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * 影を一段強く（CTA領域や強調カードに）
   */
  elevated?: boolean;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, elevated = false, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          // 基本スタイル（半透明ガラス運用は .glass クラスを併用）
          "rounded-lg border bg-card text-card-foreground",
          // 影はトークンに統一（通常: soft / 強調: soft-md）
          elevated ? "shadow-soft-md" : "shadow-soft",
          className
        )}
        {...props}
      />
    );
  }
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex flex-col space-y-1.5 p-6", className)}
      {...props}
    />
  )
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn("text-xl font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  )
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("p-6 pt-0", className)}
      {...props}
    />
  )
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex items-center p-6 pt-0", className)}
      {...props}
    />
  )
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
