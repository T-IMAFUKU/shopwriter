// /app/dashboard/page.tsx
// 目的：Dashboard 一覧に ShareCard を再利用（SSRで /api/shares を取得）
// ポイント：サーバー側fetch時に "cookie" を委譲しないと 401（未認証）になるため、headers() からCookieを転送する。

import Link from "next/link";
import { headers } from "next/headers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ShareCard, { type ShareData } from "@/components/share/ShareCard";

export const revalidate = 0;             // 常に最新
export const dynamic = "force-dynamic";  // SSR 強制

type ApiShare = {
  id: string;
  title?: string | null;
  url?: string | null;
  isPublic?: boolean | null;
  createdAt?: string | null;
};

async function fetchShares(): Promise<ShareData[]> {
  const hdrs = headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const baseUrl = `${proto}://${host}`;

  // ★ 重要：サーバーfetchでも認証クッキーを転送する
  const cookie = hdrs.get("cookie") ?? "";

  const res = await fetch(`${baseUrl}/api/shares?limit=50`, {
    cache: "no-store",
    headers: { cookie },
  });

  if (res.status === 401) {
    // 未ログイン or セッション未委譲
    return [];
  }
  if (!res.ok) {
    return [];
  }

  const data = await res.json().catch(() => null);

  // 期待形：{ items: ApiShare[], nextBefore?: string | null } もしくは 直接配列
  const arr: ApiShare[] = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];

  // APIレスポンス → ShareData へ正規化
  const items: ShareData[] = arr
    .filter((x) => typeof x?.id === "string")
    .map((x) => ({
      id: x.id,
      title: x.title ?? null,
      url: x.url ?? null,
      isPublic: Boolean(x.isPublic ?? false),
      createdAt: x.createdAt ?? null,
    }));

  return items;
}

export default async function DashboardPage() {
  const shares = await fetchShares();

  return (
    <div className="container mx-auto max-w-5xl py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/writer">新規作成</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard">更新</Link>
          </Button>
        </div>
      </div>

      {shares.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>共有一覧</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              共有データがまだありません。右上の「新規作成」から作成してください。
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {shares.map((s) => (
            <ShareCard key={s.id} share={s} />
          ))}
        </div>
      )}
    </div>
  );
}
