// components/dashboard/RecentActivityCard.tsx
// 入口整備フェーズ⑥（UI Polishing）
// 3/3: RecentActivityCard（設計バッジ削除）
//
// 方針:
// - （軽量）バッジは完全削除
// - 表示構造・Props・挙動は変更しない

import * as React from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export type RecentActivityItem = {
  id: string;
  title: string;
  href?: string;
  timeLabel?: string; // "3分前" など（任意）
};

export type RecentActivityCardProps = {
  items?: RecentActivityItem[]; // 未接続なら undefined/[] を想定
  allHref?: string; // “すべて見る”（任意・未実装なら渡さない）
};

export function RecentActivityCard({ items, allHref }: RecentActivityCardProps) {
  const list = (items ?? []).slice(0, 3);

  return (
    <Card className="p-0">
      <CardHeader className="p-5 md:p-6 pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">最近のアクティビティ</CardTitle>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          直近の操作履歴を、ここに表示します。
        </p>
      </CardHeader>

      <CardContent className="p-5 md:p-6 pt-0">
        {list.length === 0 ? (
          <div className="rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
            まだアクティビティはありません。
          </div>
        ) : (
          <ul className="space-y-3">
            {list.map((it) => (
              <li key={it.id} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{it.title}</div>
                  {it.timeLabel ? (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {it.timeLabel}
                    </div>
                  ) : null}
                </div>

                {it.href ? (
                  <Button asChild variant="ghost" size="sm">
                    <Link href={it.href} aria-label={`${it.title} を開く`}>
                      開く
                    </Link>
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {allHref ? (
          <div className="mt-3">
            <Button asChild variant="ghost" size="sm" className="px-0">
              <Link href={allHref} aria-label="アクティビティをすべて見る">
                すべて見る
              </Link>
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
