// components/dashboard/UsageSummaryCard.tsx
// 入口整備フェーズ⑤（ダッシュボード実装）
// L2-07: UsageSummaryCard（利用状況：未計測表示）
//
// 方針:
// - この段階では“未計測”の統一表示だけ（データ接続は L2-08）
// - 密度ルール：最大6行、リンク最大2、バッジ最大1
// - 未実装導線は原則非表示

import * as React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
          <Badge variant="secondary">準主役</Badge>
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
