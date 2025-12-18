// app/(dashboard)/products/page.tsx
// L2-08-D: /products 最低限UI（空状態 + 「新規作成」ダミー）
// - DB接続（最新10件）は維持
// - まずは「管理画面らしさ」だけ最低限足す（作り込みは後回し）

export const dynamic = "force-dynamic";

import Link from "next/link";
import { PrismaClient } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const prisma = new PrismaClient();

type ProductRow = {
  id: string;
  name: string;
  updatedAt: Date;
};

async function getLatestProducts(): Promise<ProductRow[]> {
  return prisma.product.findMany({
    orderBy: { updatedAt: "desc" },
    take: 10,
    select: {
      id: true,
      name: true,
      updatedAt: true,
    },
  });
}

function fmtDate(d: Date) {
  try {
    return new Date(d).toLocaleDateString();
  } catch {
    return "";
  }
}

export default async function ProductsPage() {
  let products: ProductRow[] = [];
  let error: string | null = null;

  try {
    products = await getLatestProducts();
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">商品情報管理</h1>
          <p className="text-sm text-muted-foreground">
            商品データ（最新10件）を表示しています。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* ダミー：ルートはまだ作らない（今回はボタンだけ） */}
          <Button disabled aria-disabled="true" title="準備中（次のステップで実装）">
            新規作成
          </Button>
          <Badge variant="secondary">準備中</Badge>

          <Button asChild variant="secondary">
            <Link href="/dashboard">ダッシュボードへ戻る</Link>
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">商品一覧</CardTitle>
        </CardHeader>

        <CardContent className="space-y-3">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              データ取得エラー：{error}
            </div>
          )}

          {!error && products.length === 0 && (
            <div className="rounded-lg border bg-muted/30 p-6">
              <div className="space-y-2">
                <p className="text-sm font-medium">まだ商品が登録されていません</p>
                <p className="text-sm text-muted-foreground">
                  まずは商品を1つ登録できる状態を次のステップで作ります（今回はUIのみ）。
                </p>
              </div>
              <div className="pt-4">
                <Button disabled aria-disabled="true">
                  新規作成（準備中）
                </Button>
              </div>
            </div>
          )}

          {!error && products.length > 0 && (
            <ul className="divide-y text-sm">
              {products.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">ID: {p.id}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {fmtDate(p.updatedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
