// app/(dashboard)/products/[id]/page.tsx
// L2-09B-1: 商品詳細ページ（最小DB取得）
// - 商品IDで Product を1件取得して name を表示
// - UIは最小（shadcn/ui）
// - middleware.ts のガード前提（ここでは追加制御しない）

export const dynamic = "force-dynamic";

import Link from "next/link";
import { PrismaClient } from "@prisma/client";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const prisma = new PrismaClient();

type PageProps = {
  params: { id: string };
};

export default async function ProductDetailPage({ params }: PageProps) {
  const id = params?.id ?? "";

  if (!id) notFound();

  const product = await prisma.product.findUnique({
    where: { id },
    select: { id: true, name: true, updatedAt: true },
  });

  if (!product) notFound();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold">商品詳細</h1>
          <p className="truncate text-sm text-muted-foreground">
            この商品に紐づく文脈（最小DB取得）
          </p>
        </div>

        <Button asChild variant="outline">
          <Link href="/products">一覧に戻る</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="truncate">{product.name}</CardTitle>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-sm text-muted-foreground">商品ID</div>
            <div className="break-all font-mono text-sm">{product.id}</div>
          </div>

          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-sm text-muted-foreground">更新日</div>
            <div className="text-sm">
              {new Date(product.updatedAt).toLocaleDateString()}
            </div>
          </div>

          <div className="text-sm text-muted-foreground">
            ※ 次のステップで「文章作成」への導線（Writer連携）を追加していきます。
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
