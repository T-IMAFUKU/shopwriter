"use client";

import * as React from "react";
import { DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * DropdownMenuTrigger と Button の組み合わせを一元化。
 * - 必ず `ui-btn bg-popover` を付与して透けを防止
 * - Button の variant/size など既存APIはそのまま利用可
 */
export type DropdownMenuTriggerButtonProps = ButtonProps & {
  "data-testid"?: string;
};

export const DropdownMenuTriggerButton = React.forwardRef<
  HTMLButtonElement,
  DropdownMenuTriggerButtonProps
>(function DropdownMenuTriggerButton(
  { className, children, ...props },
  ref
) {
  return (
    <DropdownMenuTrigger asChild>
      <Button
        ref={ref}
        className={cn("ui-btn bg-popover", className)}
        {...props}
      >
        {children}
      </Button>
    </DropdownMenuTrigger>
  );
});

export default DropdownMenuTriggerButton;
