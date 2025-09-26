"use client";

import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { DropdownMenuTriggerButton } from "@/components/ui/dropdown-menu-trigger-button";

export function Header() {
  return (
    <header className="border-b bg-background">
      <div className="flex h-14 items-center px-4">
        <div className="flex-1">
          <Link href="/" className="font-bold text-lg">
            ShopWriter
          </Link>
        </div>

        {/* 操作メニュー */}
        <DropdownMenu>
          <DropdownMenuTriggerButton />
          <DropdownMenuContent align="end" sideOffset={8}>
            <DropdownMenuLabel>操作メニュー</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings">設定デバッグツール</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/logout">ログアウト</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/dashboard">ダッシュボードへ</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/debug">デバッグツール</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
