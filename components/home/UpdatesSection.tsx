// components/home/UpdatesSection.tsx
// Home - Updates / Announcements
//
// 方針:
// - ヒーロー直下に置く前提の軽量セクション
// - 直近 n 件のみ表示（既定: 3）
// - 更新しやすさ最優先（ロジック最小）
// - 技術用語は出さない

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { UpdateItem } from "@/data/updates";
import { Bell } from "lucide-react";

type UpdatesSectionProps = {
  items: UpdateItem[];
  limit?: number; // 表示件数（既定: 3）
};

export function UpdatesSection({ items, limit = 3 }: UpdatesSectionProps) {
  const list = items.slice(0, limit);

  if (!list.length) return null;

  return (
    <section aria-label="updates" className="mx-auto max-w-5xl px-4">
      <Card
        className="
          relative overflow-hidden rounded-2xl
          border-primary/20
          bg-gradient-to-r from-primary/[0.08] via-primary/[0.03] to-transparent
          shadow-sm
        "
      >
        {/* 左のアクセント（派手すぎず“ここに情報がある”を作る） */}
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-primary/70 to-primary/20"
        />

        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base flex items-center gap-2">
              {/* 🔔：ここだけ黄色寄せ（カードの“顔”を作る） */}
              <span
                className="
                  inline-flex h-8 w-8 items-center justify-center rounded-xl
                  bg-amber-200/70 text-amber-900
                  ring-1 ring-amber-300/70
                "
                aria-hidden
              >
                <Bell className="h-4 w-4" />
              </span>
              お知らせ
            </CardTitle>

            <span className="sr-only">最新のお知らせを表示しています</span>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {list.map((item, idx) => (
            <div key={`${item.date}-${idx}`} className="text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-xs text-muted-foreground">{item.date}</div>

                {/* NEW：黄色キラキラはやめて、落ち着いた primary 系に戻す */}
                {idx === 0 ? (
                  <span className="inline-flex items-center rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary ring-1 ring-primary/20">
                    NEW
                  </span>
                ) : null}
              </div>

              <div className="mt-1 font-medium leading-snug">{item.title}</div>

              {item.note ? (
                <div className="mt-1 text-muted-foreground">{item.note}</div>
              ) : null}

              {/* 区切り（カードは1枚のまま、項目だけ薄く分かる） */}
              {idx !== list.length - 1 ? (
                <div className="mt-4 h-px w-full bg-border/60" aria-hidden />
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
