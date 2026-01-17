// app/(dashboard)/dashboard/share/page.tsx
// S3-06: Share（共有）— ダッシュボード内「共有一覧」正本
//
// 方針（dashboard/layout.tsx に準拠）:
// - 軽量・集約・短い説明
// - 未実装導線は原則出さない（例外のみ“準備中”をカード側で扱う）
// - 親レイアウトが「ダッシュボード」見出しを持つため、子ページは “現在地” をパンくずで明示する
//
// 重要（2026-01-10方針A）:
// - SSR内で /api/shares を fetch しない（cookie転送/host/proto差による 401/403 ブレを根絶）
// - DB直読みで「ログイン判定」「有料判定」「一覧取得」を完結する
// - 無料ユーザーは 403相当の有料案内（PaidPlanRequiredCard）を安定表示する
//
// 注意:
// - 有料判定は “確実に有料と分かる場合のみ一覧表示” とし、判定できない場合は保守的に有料案内を出す（ブレ防止優先）
//
// 修正（2026-01-10 Hotfix）:
// - Raw SQL（"userId" 列前提）を撤去し、PrismaのShareモデルに準拠（ownerId）で取得する
//   → 本番DB列差異による 42703 を根絶

import type { Metadata } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

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
        <p className="text-sm text-muted-foreground">
          共有一覧を見るにはログインしてください。
        </p>
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

/**
 * “確実に有料” と言えるものだけ true。
 * 判定できない場合は false（=有料案内へ）で SSR のブレを防ぐ。
 */
function isDefinitelyPaid(user: unknown): boolean {
  const u = user as any;
  if (!u) return false;

  // 1) Stripe/Subscription 系のよくある状態（例: active / trialing）
  const status = (u.subscriptionStatus ?? u.stripeSubscriptionStatus ?? u.planStatus ?? null) as
    | string
    | null;
  if (typeof status === "string") {
    const s = status.toLowerCase();
    if (s === "active" || s === "trialing") return true;
  }

  // 2) planCode/planName 系（例: basic/standard/premium/pro/paid）
  const plan = (u.planCode ?? u.plan ?? u.currentPlan ?? u.tier ?? null) as string | null;
  if (typeof plan === "string") {
    const p = plan.toLowerCase();
    if (
      p === "paid" ||
      p === "pro" ||
      p === "basic" ||
      p === "standard" ||
      p === "premium" ||
      p === "plus"
    ) {
      return true;
    }
  }

  // 3) 有料の根拠になるID（customer/subscription）だけでは “確実” とみなさない（保守）
  return false;
}

async function resolveDbUserIdFromSession(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const sessionUserId = (session as any)?.user?.id as string | undefined;

  // 未ログイン
  if (!sessionUserId) return null;

  const isDev = process.env.NODE_ENV !== "production";

  // まず session.user.id を DB の User.id として引いてみる
  const u1 = await prisma.user.findUnique({ where: { id: sessionUserId } });
  if (u1) return u1.id;

  // dev で一致しないケースを吸収（現場運用の既知パターン）
  if (isDev) {
    const fallback = process.env.DEV_X_USER_ID ?? "dev-user-1";
    const u2 = await prisma.user.findUnique({ where: { id: fallback } });
    if (u2) return u2.id;
  }

  // ここまで来たら DB 上でユーザー特定できない（=保守的に有料案内へ）
  return sessionUserId; // “ログイン済み”の事実はあるので返す（ただし一覧は出さない）
}

async function readCurrentUser(dbUserId: string) {
  // select を絞らず取得（ただし unknown フィールドアクセスは any で吸収）
  return prisma.user.findUnique({ where: { id: dbUserId } });
}

async function readSharesForUser(dbUserId: string): Promise<ShareItem[]> {
  // ✅ Raw SQL を撤去：Shareモデルに準拠して ownerId で取得する
  const rows = await prisma.share.findMany({
    where: { ownerId: dbUserId },
    orderBy: { updatedAt: "desc" },
    take: 30,
    select: {
      id: true,
      title: true,
      isPublic: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return rows.map((r) => ({
    id: String(r.id),
    title: String(r.title ?? ""),
    isPublic: Boolean(r.isPublic),
    createdAt: new Date(r.createdAt).toISOString(),
    updatedAt: new Date(r.updatedAt).toISOString(),
  }));
}

export default async function ShareListPage() {
  const session = await getServerSession(authOptions);
  const sessionUserId = (session as any)?.user?.id as string | undefined;

  // 未ログイン（UI上の案内）
  if (!sessionUserId) {
    return (
      <div className="space-y-6">
        <Breadcrumb />
        <LoginRequiredCard />
      </div>
    );
  }

  // DB上の userId を解決（devフォールバック含む）
  const dbUserId = await resolveDbUserIdFromSession();
  if (!dbUserId) {
    return (
      <div className="space-y-6">
        <Breadcrumb />
        <LoginRequiredCard />
      </div>
    );
  }

  // ユーザー情報を DB から取得し、有料判定（保守的）
  const user = await readCurrentUser(dbUserId);
  const paid = isDefinitelyPaid(user);

  if (!paid) {
    return (
      <div className="space-y-6">
        <Breadcrumb />
        <PaidPlanRequiredCard />
      </div>
    );
  }

  // 有料なら一覧取得
  let shares: ShareItem[] = [];
  let loadError: string | null = null;

  try {
    shares = await readSharesForUser(dbUserId);
  } catch (e) {
    loadError = e instanceof Error ? e.message : "unknown error";
    shares = [];
  }

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
          {loadError ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-muted-foreground">
                共有一覧の読み込みに失敗しました。
                <span className="block mt-1 text-xs">詳細: {loadError}</span>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button asChild>
                  <Link href="/writer">Writerへ</Link>
                </Button>

                {/* ✅ 方針：準備中を廃止し、/share/guide の通常リンクに戻す */}
                <Button variant="outline" asChild>
                  <Link href="/share/guide">共有の使い方</Link>
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

                {/* ✅ 方針：準備中を廃止し、/share/guide の通常リンクに戻す */}
                <Button variant="outline" asChild>
                  <Link href="/share/guide">共有の使い方</Link>
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

                  {/* ✅ 方針：準備中を廃止し、/share/guide の通常リンクに戻す */}
                  <Button variant="outline" asChild>
                    <Link href="/share/guide">共有の使い方</Link>
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
