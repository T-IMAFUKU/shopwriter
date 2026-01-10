// app/(dashboard)/dashboard/share/page.tsx
// S3-06: Share（共有）— ダッシュボード内「共有一覧」正本
//
// 方針（dashboard/layout.tsx に準拠）:
// - 軽量・集約・短い説明
// - 未実装導線は原則出さない（例外のみ“準備中”をカード側で扱う）
// - 親レイアウトが「ダッシュボード」見出しを持つため、子ページは “現在地” をパンくずで明示する
//
// 重要:
// - このページは DB 直読みを禁止し、SSOT として GET /api/shares を使用する
// - dev契約で /api/shares が X-User-Id（DB上のUser.id）を要求する場合があるため、dev時は seed の "dev-user-1" を送って吸収する
//
// 修正（2026-01-10）:
// - 401/403 を「ログイン不足」「有料プラン必要」で出し分け
//   （無料プランなのに“ログインが必要”に見えてしまう誤解を解消）
//
// 注意:
// - 403 は本来「権限NG」全般（例: owner不一致等）も含む可能性がある。
//   ただし現状のUX方針として、このページでは 403 を「プラン不足」として案内する。

import type { Metadata } from "next";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "共有 | ShopWriter",
};

type ShareItem = {
  id: string;
  title: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
};

type SharesListResponse = {
  items: ShareItem[];
  nextCursor: string | null;
};

function formatYmdHmFromIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd} ${hh}:${mi}`;
}

function getBaseUrlFromHeaders(): string {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  return host ? `${proto}://${host}` : "http://localhost:3000";
}

async function safeReadErrorMessage(res: Response): Promise<string | null> {
  try {
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const j = (await res.json()) as any;
      const msg =
        typeof j?.error === "string"
          ? j.error
          : typeof j?.message === "string"
            ? j.message
            : null;
      return msg;
    }
    const t = await res.text();
    return t ? t.slice(0, 200) : null;
  } catch {
    return null;
  }
}

function Breadcrumb() {
  return (
    <nav aria-label="breadcrumb" className="text-sm text-muted-foreground">
      <Link href="/dashboard" className="hover:text-foreground hover:underline">
        ダッシュボード
      </Link>
      <span className="mx-2" aria-hidden="true">
        ＞
      </span>
      <span className="text-foreground">共有</span>
    </nav>
  );
}

function LoginRequiredCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">ログインが必要です</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">共有一覧を見るにはログインしてください。</p>
        <Button asChild>
          <Link href="/api/auth/signin">ログイン</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function PaidPlanRequiredCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">この機能は有料プランで利用できます</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          共有（管理）機能は有料プラン限定です。プランを選んで開始できます。
        </p>
        <Button asChild>
          <Link href="/pricing">プランと料金を見る</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default async function ShareListPage() {
  const session = await getServerSession(authOptions);
  const userId = (session as any)?.user?.id as string | undefined;

  // 未ログイン（UI上の案内）
  if (!userId) {
    return (
      <div className="space-y-6">
        <Breadcrumb />
        <LoginRequiredCard />
      </div>
    );
  }

  const baseUrl = getBaseUrlFromHeaders();
  const cookie = cookies().toString();
  const isDev = process.env.NODE_ENV !== "production";

  const reqHeaders: Record<string, string> = {
    accept: "application/json",
  };
  if (cookie) reqHeaders.cookie = cookie;

  // dev契約吸収：/api/shares が「X-User-Id（DB上のUser.id）」を要求する場合がある
  // ※ sessionのuserIdはローカルDBのUser.idと一致しないことがあるため、seed固定値を使う
  if (isDev) {
    reqHeaders["x-user-id"] = process.env.DEV_X_USER_ID ?? "dev-user-1";
  }

  const res = await fetch(`${baseUrl}/api/shares?limit=30`, {
    method: "GET",
    cache: "no-store",
    headers: reqHeaders,
  });

  // 401: 未ログイン/セッション無し（ログイン案内）
  if (res.status === 401) {
    return (
      <div className="space-y-6">
        <Breadcrumb />
        <LoginRequiredCard />
      </div>
    );
  }

  // 403: 権限NG（ここでは “プラン不足” として案内）
  if (res.status === 403) {
    return (
      <div className="space-y-6">
        <Breadcrumb />
        <PaidPlanRequiredCard />
      </div>
    );
  }

  let data: SharesListResponse | null = null;
  let errMsg: string | null = null;

  if (!res.ok) {
    errMsg = await safeReadErrorMessage(res);
  } else {
    try {
      data = (await res.json()) as SharesListResponse;
    } catch {
      data = null;
    }
  }

  const shares = Array.isArray(data?.items) ? data!.items : [];

  return (
    <div className="space-y-6">
      {/* 現在地（breadcrumb） */}
      <Breadcrumb />

      {/* 説明（控えめ） */}
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">
          Writerの出力を「共有カード」として保存し、公開/非公開を切り替えられます。
        </p>
      </header>

      {/* 一覧 */}
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-base">共有一覧</CardTitle>
          <p className="text-sm text-muted-foreground">あなたが作成した共有カードを表示します。</p>
        </CardHeader>

        <CardContent className="space-y-4">
          {!res.ok ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-muted-foreground">
                共有一覧の読み込みに失敗しました（HTTP {res.status}）。
                {errMsg ? <span className="block mt-1 text-xs">詳細: {errMsg}</span> : null}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button asChild>
                  <Link href="/writer">Writerへ</Link>
                </Button>
                <Button variant="outline" disabled aria-disabled="true" title="準備中">
                  共有の使い方（準備中）
                </Button>
              </div>
            </div>
          ) : shares.length === 0 ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-muted-foreground">
                まだ共有カードがありません。Writerで文章を作成し、「共有カードを作成」から追加してください。
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button asChild>
                  <Link href="/writer">Writerへ</Link>
                </Button>
                <Button variant="outline" disabled aria-disabled="true" title="準備中">
                  共有の使い方（準備中）
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-muted-foreground">{shares.length} 件の共有カードがあります。</div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button asChild>
                    <Link href="/writer">Writerへ</Link>
                  </Button>
                  <Button variant="outline" disabled aria-disabled="true" title="準備中">
                    共有の使い方（準備中）
                  </Button>
                </div>
              </div>

              <div className="divide-y rounded-md border">
                {shares.map((s) => (
                  <div
                    key={s.id}
                    className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/dashboard/share/${s.id}`}
                          className="truncate font-medium hover:underline"
                          title={s.title}
                        >
                          {s.title}
                        </Link>

                        {s.isPublic ? <Badge>公開</Badge> : <Badge variant="secondary">非公開</Badge>}
                      </div>

                      <div className="mt-1 text-xs text-muted-foreground">
                        更新: {formatYmdHmFromIso(s.updatedAt)} / 作成: {formatYmdHmFromIso(s.createdAt)}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <Button variant="outline" asChild>
                        <Link href={`/dashboard/share/${s.id}`}>管理</Link>
                      </Button>

                      <Button variant="outline" asChild>
                        <Link href={`/share/${s.id}`}>公開ページ</Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-xs text-muted-foreground">
                ※ 公開/非公開の切替・URLコピーは、次ステップでこの一覧から行えるようにしていきます。
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ヒント */}
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-base">ヒント</CardTitle>
          <p className="text-sm text-muted-foreground">公開にすると、共有URLをコピーして他の人に見せられます。</p>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          公開/非公開の切替・URLコピーは、この一覧ページから行えるようにしていきます。
        </CardContent>
      </Card>
    </div>
  );
}
