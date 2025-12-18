// components/dashboard/HelpHubCard.tsx
// 入口整備フェーズ⑤（ダッシュボード実装）
// L2-04: HelpHubCard（ヘルプ入口の集約）
//
// ルール:
// - リンク最大2 / バッジ最大1 / 6行以内（説明は短く）
// - 未実装導線は原則非表示（このカードは“実装済み”導線のみ）
// - 長文説明・重い要素は禁止

import * as React from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export type HelpHubCardProps = {
  supportHref: string; // /support
  shareGuideHref: string; // /share/guide
};

export function HelpHubCard({ supportHref, shareGuideHref }: HelpHubCardProps) {
  return (
    <Card className="p-0">
      <CardHeader className="p-5 md:p-6 pb-3">
        <CardTitle className="text-base">ヘルプ</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          困ったときの入口をまとめました。
        </p>
      </CardHeader>

      <CardContent className="p-5 md:p-6 pt-0">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild variant="secondary" className="justify-start">
            <Link href={supportHref} aria-label="サポートへ">
              サポート
            </Link>
          </Button>

          <Button asChild variant="ghost" className="justify-start">
            <Link href={shareGuideHref} aria-label="共有の使い方へ">
              共有の使い方
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
