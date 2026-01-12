// components/dashboard/AccountStatusSummaryCard.tsx
// 入口整備フェーズ⑤（ダッシュボード実装）
// L2-06: AccountStatusSummaryCard（アカウント状態：表示枠のみ）
//
// 方針:
// - この段階では“枠”だけ（データ接続は L2-08）
// - 密度ルール：最大6行、リンク最大2、バッジ最大1
// - 未実装導線は原則非表示（必要なら“準備中”を非活性表示）

import * as React from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export type AccountStatusSummaryCardProps = {
  // 未接続のため、現時点では全部 optional
  statusLabel?: string; // 例: "有効" / "支払い遅延" / "未ログイン" など
  hint?: string; // 例: "請求情報を確認してください"
  primaryActionHref?: string; // 例: "/account/billing"
  primaryActionLabel?: string; // 例: "請求情報へ"
};

export function AccountStatusSummaryCard({
  statusLabel,
  hint,
  primaryActionHref,
  primaryActionLabel,
}: AccountStatusSummaryCardProps) {
  const label = statusLabel ?? "未取得";
  const sub = hint ?? "アカウント状態を確認できます。";

  return (
    <Card className="p-0">
      <CardHeader className="p-5 md:p-6 pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">アカウント状態</CardTitle>
          <Badge variant="secondary">準主役</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{sub}</p>
      </CardHeader>

      <CardContent className="p-5 md:p-6 pt-0">
        <div className="rounded-md border bg-muted/20 p-4">
          <div className="text-sm font-medium">{label}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {statusLabel ? "現在の状態を表示しています。" : "準備中です。"}
          </div>
        </div>

        {primaryActionHref && primaryActionLabel ? (
          <div className="mt-3">
            <Button asChild variant="secondary" className="justify-start">
              <Link href={primaryActionHref} aria-label={primaryActionLabel}>
                {primaryActionLabel}
              </Link>
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
