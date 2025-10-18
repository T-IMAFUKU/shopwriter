"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HelpCircle, BookOpen, LifeBuoy, MessageSquare, ExternalLink } from "lucide-react";

type Props = {
  /** 右寄せにしたいとき true（ヘッダー右端など） */
  alignEnd?: boolean;
  /** ラベル表記（既定: ヘルプ） */
  label?: string;
  /** className を上書きしたい場合 */
  className?: string;
};

/**
 * グローバル共通のヘルプドロップダウン。
 * layout から配置して全ページで利用する想定。
 */
export default function HelpDropdown({ alignEnd = true, label = "ヘルプ", className }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={["gap-1.5", className].filter(Boolean).join(" ")}
          aria-label={label}
        >
          <HelpCircle className="size-4" />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={alignEnd ? "end" : "start"}
        sideOffset={8}
        className="w-56"
      >
        <DropdownMenuLabel>サポート</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href="/share/guide" className="inline-flex w-full items-center gap-2">
            <BookOpen className="size-4" />
            利用ガイド
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href="/help/faq" className="inline-flex w-full items-center gap-2">
            <LifeBuoy className="size-4" />
            よくある質問
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href="/help/feedback" className="inline-flex w-full items-center gap-2">
            <MessageSquare className="size-4" />
            フィードバック送信
            <ExternalLink className="size-3 ml-auto opacity-70" />
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

