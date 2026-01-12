"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HelpCircle, BookOpen, LifeBuoy, MessageSquare } from "lucide-react";

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
 * 方針（選択肢A）: /help はヘッダー導線から外し、直リンクに統一する。
 * - 利用ガイド: /guide
 * - よくある質問: /faq
 * - フィードバック送信: /feedback
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

      <DropdownMenuContent align={alignEnd ? "end" : "start"} sideOffset={8} className="w-56">
        <DropdownMenuLabel>サポート</DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href="/guide" className="inline-flex w-full items-center gap-2">
            <BookOpen className="size-4" />
            利用ガイド
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link href="/faq" className="inline-flex w-full items-center gap-2">
            <LifeBuoy className="size-4" />
            よくある質問
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link href="/feedback" className="inline-flex w-full items-center gap-2">
            <MessageSquare className="size-4" />
            フィードバック送信
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
