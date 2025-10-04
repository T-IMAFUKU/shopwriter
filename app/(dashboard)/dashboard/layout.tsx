// app/(dashboard)/dashboard/layout.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"; // shadcn/ui の Select

const TABS = [
  { key: "7d", label: "7日" },
  { key: "14d", label: "14日" },
  { key: "30d", label: "30日" },
] as const;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentRange = (searchParams.get("range") ?? "14d").toLowerCase();
  const hrefOf = (k: string) => {
    const sp = new URLSearchParams(searchParams?.toString() ?? "");
    sp.set("range", k);
    return `${pathname}?${sp.toString()}`;
  };

  const currentLevel = searchParams.get("level") ?? "all";

  return (
    <section
      className="
        mx-auto
        max-w-[var(--layout-max-w,1100px)]
        px-[var(--spacing-6)]
        py-[var(--spacing-6)]
      "
    >
      <header className="mb-[var(--spacing-6)]">
        <h1 className="text-[var(--font-size-2xl,1.5rem)] font-[var(--font-weight-semibold,600)]">
          計測ダッシュボード
        </h1>
        <p className="mt-[var(--spacing-2)] text-[var(--font-size-sm,.875rem)] text-[var(--text-muted,#64748b)]">
          EventLog の集計を、表と簡易グラフで確認できます。
        </p>

        {/* サブナビ（土台 range） */}
        <nav aria-label="期間フィルタ" className="mt-[var(--spacing-4)]">
          <ul
            className="
              inline-flex
              gap-[var(--spacing-2)]
              rounded-[var(--ui-radius-md,0.5rem)]
              p-[var(--spacing-1)]
              bg-[var(--surface-subtle,#f6f7f9)]
            "
            role="tablist"
          >
            {TABS.map((t) => {
              const isActive = currentRange === t.key;
              return (
                <li key={t.key} role="presentation">
                  <Link
                    href={hrefOf(t.key)}
                    role="tab"
                    aria-selected={isActive}
                    data-state={isActive ? "active" : "inactive"}
                    className="
                      inline-flex items-center justify-center
                      min-w-[4.5rem]
                      px-[var(--spacing-3)]
                      py-[calc(var(--spacing-2)*0.9)]
                      text-[var(--font-size-sm,.875rem)]
                      rounded-[var(--ui-radius-sm,0.375rem)]
                      transition-[background-color,box-shadow]
                      outline-none
                      ring-[var(--focus-ring-width,2px)]
                      ring-offset-[var(--focus-ring-offset,2px)]
                      ring-transparent
                      hover:shadow-[var(--shadow-xs,0_1px_2px_rgba(0,0,0,.06))]
                      data-[state=active]:bg-[var(--surface,white)]
                      data-[state=active]:shadow-[var(--shadow-sm,0_1px_3px_rgba(0,0,0,.08))]
                      data-[state=inactive]:bg-transparent
                    "
                  >
                    {t.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* レベルフィルタ（土台 UI のみ） */}
        <div className="mt-[var(--spacing-4)] max-w-[12rem]">
          <Select defaultValue={currentLevel}>
            <SelectTrigger>
              <SelectValue placeholder="レベルを選択" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべて</SelectItem>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="warn">Warn</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </header>

      <main className="space-y-[var(--spacing-6)]" role="main">
        {children}
      </main>
    </section>
  );
}