// components/dashboard/UsageSummaryCard.tsx
// 入口整備フェーズ⑥（UI Polishing）
// 2/3: UsageSummaryCard（設計バッジ削除）
//
// 方針:
// - （準主役）バッジは完全削除
// - 表示構造・Props・挙動は変更しない

import * as React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export type UsageSummaryCardProps = {
  // まだ計測しないので optional
  monthlyUsed?: number;
  monthlyLimit?: number;
  hourlyUsed?: number;
  hourlyLimit?: number;
};

export function UsageSummaryCard(_props: UsageSummaryCardProps) {
  return (
    <Card className="p-0">
      <CardHeader className="p-5 md:p-6 pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">利用状況</CardTitle>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          文章作成の利用状況を表示します。
        </p>
      </CardHeader>

      <CardContent className="p-5 md:p-6 pt-0">
        <div className="rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
          利用状況は準備中です。
        </div>
      </CardContent>
    </Card>
  );
}
