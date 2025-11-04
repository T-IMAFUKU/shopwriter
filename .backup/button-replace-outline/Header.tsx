"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { DropdownMenuTriggerButton } from "@/components/ui/dropdown-menu-trigger-button";

export default function Header() {
  return (
    <header className="w-full border-b bg-background">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-base font-semibold">
            ShopWriter
          </Link>
          <nav className="hidden md:flex items-center gap-4 text-sm">
            <Link href="/dashboard" className="underline-offset-4 hover:underline">
              DashboardWriter
            </Link>
          </nav>
        </div>

        {/* ★ 強制オープン（defaultOpen）で Content を必ずマウント */}
        <DropdownMenu defaultOpen>
          {/* Trigger は一重。二重にしない */}
          <DropdownMenuTriggerButton className="ui-btn gap-2" aria-label="メニューを開く">
            <Menu className="h-4 w-4" />
            <span className="hidden sm:inline">Menu</span>
          </DropdownMenuTriggerButton>

          {/* ★ まずは“絶対見える”スタイルを直書きして確認 */}
          <DropdownMenuContent
            id="debug-menu-content"
            align="end"
            sideOffset={8}
            className="w-56 bg-white border shadow-md rounded-md z-[99999]"
          >
            <DropdownMenuLabel>操作メニュー</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link href="/settings">設定デバッグツール</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link href="/api/auth/signout">ログアウト</Link></DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link href="/dashboard">ダッシュボードへ</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link href="/debug">デバッグツール</Link></DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

