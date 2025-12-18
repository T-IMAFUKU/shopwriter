// components/dashboard/QuickActionsCard.tsx
// 入口整備フェーズ⑤（ダッシュボード実装）
// L2-03: QuickActionsCard（主役：よく使う機能）
//
// ルール:
// - 未実装導線：原則非表示（このカードは“実装済み”導線のみ出す）
// - リンク最大2 / バッジ最大1 / 6行以内（説明は短く）
// - レベル3要素（重い表/長文）は置かない

import * as React from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export type QuickActionsCardProps = {
  writerHref: string; // 文章作成
  productsHref: string; // 商品情報管理
};

export function QuickActionsCard({
  writerHref,
  productsHref,
}: QuickActionsCardProps) {
  return (
    <Card className="p-0">
      <CardHeader className="p-5 md:p-6 pb-3">
        <CardTitle className="text-base">よく使う機能</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          すぐ始めたい作業にショートカットできます。
        </p>
      </CardHeader>

      <CardContent className="p-5 md:p-6 pt-0">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Button asChild size="lg" className="justify-start">
            <Link href={writerHref} aria-label="文章作成へ">
              文章作成
            </Link>
          </Button>

          <Button
            asChild
            size="lg"
            variant="secondary"
            className="justify-start"
          >
            <Link href={productsHref} aria-label="商品情報管理へ">
              商品情報管理
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
