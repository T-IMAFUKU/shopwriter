import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PageProps = { params: { id: string } };

/**
 * /share/[id]（公開ページ / 他人閲覧用）
 *
 * 方針:
 * - 公開（isPublic=true）のものだけ表示
 * - 非公開は notFound（= 他人は見れない）
 * - 管理UI・管理導線は出さない（管理は /dashboard/share/[id] に集約）
 *
 * note:
 * - SEOは現状 noindex を維持（公開URLの意図的共有を前提に、検索インデックスは避ける）
 */
export const metadata: Metadata = {
  title: "共有 | ShopWriter",
  description: "ShopWriterで作成した共有カードの公開ページです。",
  robots: { index: false, follow: false, nocache: true },
  openGraph: {
    title: "共有 | ShopWriter",
    description: "ShopWriterで作成した共有カードの公開ページです。",
    type: "article",
  },
};

export default async function SharePublicPage({ params }: PageProps) {
  const id = params.id;

  const share = await prisma.share.findFirst({
    where: { id, isPublic: true },
    select: {
      id: true,
      title: true,
      body: true,
      updatedAt: true,
    },
  });

  if (!share) notFound();

  const title = (share.title ?? "").trim() || "共有";
  const body = (share.body ?? "").trim();

  return (
    <main className="container mx-auto max-w-3xl py-8 space-y-6">
      <section className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">
          このページは共有カードの公開ページです。
        </p>
      </section>

      <Card className="rounded-xl shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">本文</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4 text-sm">
          {body ? (
            <pre className="whitespace-pre-wrap leading-6">{body}</pre>
          ) : (
            <p className="text-muted-foreground">（本文がありません）</p>
          )}

          <p className="text-xs text-muted-foreground">
            更新: {share.updatedAt.toISOString()}
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
