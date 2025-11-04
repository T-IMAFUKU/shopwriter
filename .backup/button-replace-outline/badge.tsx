import * as React from "react";
import { cn } from "@/lib/utils";

export type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: BadgeVariant;
}

/**
 * shadcn/ui 準拠の Badge
 */
const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant = "default", ...props }, ref) => {
    const base =
      "inline-flex items-center border text-xs font-semibold transition-colors";
    const styles: Record<BadgeVariant, string> = {
      default:
        "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
      secondary:
        "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
      destructive:
        "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
      outline: "text-foreground",
    };
    return (
      <div
        ref={ref}
        className={cn(base, styles[variant], className)}
        style={{
          borderRadius: "var(--ui-radius-md)",
          padding: "var(--spacing-1) var(--spacing-2)", // px-2.5/py-0.5をトークン近似で統一
        }}
        {...props}
      />
    );
  }
);
Badge.displayName = "Badge";

export { Badge };

