import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { ShareOwnerActions } from "./ShareOwnerActions.client";

export const dynamic = "force-dynamic";

type PageProps = { params: { id: string } };

function isProd(): boolean {
  return process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
}

/**
 * Step3（最終）:
 * - Script 完全撤去
 * - sonner（Client Component）正式接続
 * - OGP + noindex 維持
 */
export const metadata: Metadata = {
  title: "共有（自分用） | ShopWriter",
  description: "共有コンテンツの確認と公開/非公開の切替ができます。",
  robots: { index: false, follow: false, nocache: true },
  openGraph: {
    title: "共有（自分用） | ShopWriter",
    description: "共有コンテンツの確認と公開/非公開の切替ができます。",
    type: "article",
  },
};

export default async function ShareOwnerDetailPage({ params }: PageProps) {
  const id = params.id;

  // 最短MVP：ローカル検証用（dev-user-1 固定）
  // 本番の /share は NextAuth 接続後に解放する想定
  if (isProd()) notFound();
  const ownerId = "dev-user-1";

  const share = await prisma.share.findFirst({
    where: { id, ownerId },
    select: {
      id: true,
      title: true,
      body: true,
      isPublic: true,
      ownerId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!share) notFound();

  const title = (share.title ?? "").trim() || "共有（自分用）";
  const body = (share.body ?? "").trim();
  const publicUrl = `/share/${share.id}`;

  return (
    <main className="container mx-auto max-w-3xl py-8 space-y-6">
      {/* Header */}
      <section className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">共有 詳細（自分用）</h1>
        <p className="text-sm text-muted-foreground">
          自分の共有コンテンツを確認し、公開/非公開を切り替えできます。
        </p>
      </section>

      {/* Summary */}
      <Card className="rounded-xl shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base">基本情報</CardTitle>

            <ShareOwnerActions
              shareId={share.id}
              body={body}
              isPublic={share.isPublic}
              ownerHeaderUserId="dev-user-1"
            />
          </div>
        </CardHeader>

        <CardContent className="space-y-3 text-sm">
          <dl className="grid grid-cols-[110px_1fr] gap-x-4 gap-y-2">
            <dt className="text-muted-foreground">ID</dt>
            <dd className="font-mono">{share.id}</dd>

            <dt className="text-muted-foreground">タイトル</dt>
            <dd className="font-medium">{title}</dd>

            <dt className="text-muted-foreground">公開状態</dt>
            <dd>{share.isPublic ? "公開" : "非公開"}</dd>

            <dt className="text-muted-foreground">公開URL</dt>
            <dd>
              {share.isPublic ? (
                <Link className="underline" href={publicUrl}>
                  {publicUrl}
                </Link>
              ) : (
                <span className="text-muted-foreground">（非公開）</span>
              )}
            </dd>
          </dl>
        </CardContent>
      </Card>

      {/* Body */}
      <Card className="rounded-xl shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base">本文</CardTitle>

            {/* コピー操作は Client Component 側に集約 */}
            <Button
              size="sm"
              variant="secondary"
              type="button"
              disabled={!body}
              aria-disabled={!body}
              title={!body ? "コピーできる本文がありません" : "本文をコピー"}
            >
              本文をコピー
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 text-sm">
          {body ? (
            <pre className="whitespace-pre-wrap leading-6">{body}</pre>
          ) : (
            <p className="text-muted-foreground">（本文がありません）</p>
          )}
        </CardContent>
      </Card>

      {/* Back */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" asChild className="px-0">
          <Link href="/shares">← 共有一覧へ戻る</Link>
        </Button>

        <Button variant="ghost" asChild className="px-0">
          <Link href="/">トップへ戻る</Link>
        </Button>
      </div>
    </main>
  );
}
