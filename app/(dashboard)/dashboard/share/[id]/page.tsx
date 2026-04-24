// app/(dashboard)/dashboard/share/[id]/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ShareAdminActions, { ShareAdminBodyCopyButton } from "./ShareAdminActions.client";

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

type ShareDetailResponse = {
  id: string;
  title: string;
  body: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
};

export const metadata: Metadata = {
  title: "共有の管理 | ShopWriter",
};

// ✅ 本番で session/cookies/headers 依存の挙動を安定させる（静的最適化を避ける）
export const dynamic = "force-dynamic";
export const revalidate = 0;

function getBaseUrlFromHeaders(): string {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  if (!host) throw new Error("Failed to build base URL: missing host header");
  return `${proto}://${host}`;
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

/**
 * API返却shapeの揺れを吸収（UIを壊さない）
 */
function normalizeSharesList(raw: any): SharesListResponse | null {
  const cand = raw?.data ?? raw;
  const items = cand?.items;
  const nextCursor = cand?.nextCursor ?? null;

  if (!Array.isArray(items)) return null;

  const ok = items.every(
    (x: any) =>
      x &&
      typeof x.id === "string" &&
      typeof x.title === "string" &&
      typeof x.isPublic === "boolean" &&
      typeof x.createdAt === "string" &&
      typeof x.updatedAt === "string",
  );
  if (!ok) return null;

  return { items, nextCursor: typeof nextCursor === "string" ? nextCursor : null };
}

function normalizeShareDetail(raw: any): ShareDetailResponse | null {
  const cand = raw?.data ?? raw?.item ?? raw?.share ?? raw;
  if (!cand) return null;

  if (
    typeof cand.id !== "string" ||
    typeof cand.title !== "string" ||
    typeof cand.body !== "string" ||
    typeof cand.isPublic !== "boolean" ||
    typeof cand.createdAt !== "string" ||
    typeof cand.updatedAt !== "string"
  ) {
    return null;
  }

  return cand as ShareDetailResponse;
}

/**
 * ✅重要:
 * dev/test では API が X-User-Id を要求する前提があるため付与する。
 * ただし「dev-user-1 固定」は所有者ズレで403を生むので、
 * ログイン中は session.user.id（= DB由来ID）を優先して使う。
 */
function buildSharesHeaders(opts: { isDev: boolean; devUserId: string | null }): Record<string, string> {
  // ✅案2：server-side fetch には “生のCookieヘッダ” をそのまま転送する（認証伝播を堅くする）
  const cookie = headers().get("cookie") ?? "";

  const reqHeaders: Record<string, string> = { accept: "application/json" };
  if (cookie) reqHeaders.cookie = cookie;

  if (opts.isDev && opts.devUserId) {
    reqHeaders["x-user-id"] = opts.devUserId;
  }

  return reqHeaders;
}

async function fetchSharesList(opts: {
  isDev: boolean;
  devUserId: string | null;
}): Promise<{
  res: Response;
  data: SharesListResponse | null;
  errMsg: string | null;
}> {
  const base = getBaseUrlFromHeaders();
  const url = new URL("/api/shares?limit=30", base).toString();

  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: buildSharesHeaders(opts),
  });

  if (!res.ok) {
    const errMsg = await safeReadErrorMessage(res);
    return { res, data: null, errMsg };
  }

  try {
    const raw = (await res.json()) as any;
    const data = normalizeSharesList(raw);
    if (!data) return { res, data: null, errMsg: "Unexpected list response shape." };
    return { res, data, errMsg: null };
  } catch {
    return { res, data: null, errMsg: "Failed to parse response JSON." };
  }
}

async function fetchShareDetail(
  id: string,
  opts: { isDev: boolean; devUserId: string | null },
): Promise<{
  res: Response;
  data: ShareDetailResponse | null;
  errMsg: string | null;
}> {
  const base = getBaseUrlFromHeaders();
  const url = new URL(`/api/shares/${encodeURIComponent(id)}`, base).toString();

  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: buildSharesHeaders(opts),
  });

  if (!res.ok) {
    const errMsg = await safeReadErrorMessage(res);
    return { res, data: null, errMsg };
  }

  try {
    const raw = (await res.json()) as any;
    const data = normalizeShareDetail(raw);
    if (!data) return { res, data: null, errMsg: "Unexpected detail response shape." };
    return { res, data, errMsg: null };
  } catch {
    return { res, data: null, errMsg: "Failed to parse response JSON." };
  }
}

function fmtJp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export default async function Page({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const sessionUserId = (session as any)?.user?.id as string | undefined;

  // ダッシュボード配下はログイン前提だが、保険として未ログインは案内
  if (!sessionUserId) {
    return (
      <div className="space-y-6">
        <nav aria-label="breadcrumb" className="text-sm text-muted-foreground">
          <Link href="/dashboard" className="hover:text-foreground hover:underline">
            ダッシュボード
          </Link>
          <span className="mx-2" aria-hidden="true">
            ＞
          </span>
          <Link href="/dashboard/share" className="hover:text-foreground hover:underline">
            共有
          </Link>
          <span className="mx-2" aria-hidden="true">
            ＞
          </span>
          <span className="text-foreground">管理</span>
        </nav>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">ログインが必要です</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">共有の管理を見るにはログインしてください。</p>
            <Button asChild>
              <Link href="/api/auth/signin">ログイン</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const id = params.id;

  const isDev = process.env.NODE_ENV !== "production";

  // ✅devでは「ログイン中のDB由来ID」をX-User-Idとして使う（所有者ズレを防ぐ）
  // 未ログイン時は上で弾いているので、ここでは sessionUserId が基本。
  const devUserId = isDev ? sessionUserId : null;

  const list = await fetchSharesList({ isDev, devUserId });

  if (list.res.status === 401 || list.res.status === 403) {
    return (
      <div className="space-y-6">
        <nav aria-label="breadcrumb" className="text-sm text-muted-foreground">
          <Link href="/dashboard" className="hover:text-foreground hover:underline">
            ダッシュボード
          </Link>
          <span className="mx-2" aria-hidden="true">
            ＞
          </span>
          <Link href="/dashboard/share" className="hover:text-foreground hover:underline">
            共有
          </Link>
          <span className="mx-2" aria-hidden="true">
            ＞
          </span>
          <span className="text-foreground">管理</span>
        </nav>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">ログインが必要です</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">共有の管理を見るにはログインしてください。</p>
            <Button asChild>
              <Link href="/api/auth/signin">ログイン</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!list.res.ok || !list.data || !Array.isArray(list.data.items)) {
    return (
      <main className="container mx-auto max-w-4xl py-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">共有の管理</h1>
          <Button variant="ghost" asChild className="px-0">
            <Link href="/dashboard/share">← 共有一覧へ戻る</Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">読み込みに失敗しました</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <div>共有一覧の取得に失敗しました（HTTP {list.res.status}）。</div>
            {list.errMsg ? <div className="text-xs">詳細: {list.errMsg}</div> : null}
          </CardContent>
        </Card>
      </main>
    );
  }

  const inList = list.data.items.find((x) => x.id === id);
  if (!inList) notFound();

  const detail = await fetchShareDetail(id, { isDev, devUserId });

  if (detail.res.status === 401) {
    return (
      <main className="container mx-auto max-w-4xl py-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">共有の管理</h1>
          <Button variant="ghost" asChild className="px-0">
            <Link href="/dashboard/share">← 共有一覧へ戻る</Link>
          </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">ログインが必要です</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            共有の管理を見るにはログインしてください。
          </CardContent>
        </Card>
      </main>
    );
  }

  if (detail.res.status === 403) {
    return (
      <main className="container mx-auto max-w-4xl py-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">共有の管理</h1>
          <Button variant="ghost" asChild className="px-0">
            <Link href="/dashboard/share">← 共有一覧へ戻る</Link>
          </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">アクセス権限がありません</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <div>この共有アイテムの詳細を表示する権限がありません（HTTP 403）。</div>
            {detail.errMsg ? <div className="text-xs">詳細: {detail.errMsg}</div> : null}
          </CardContent>
        </Card>
      </main>
    );
  }

  if (!detail.res.ok || !detail.data) {
    return (
      <main className="container mx-auto max-w-4xl py-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">共有の管理</h1>
          <Button variant="ghost" asChild className="px-0">
            <Link href="/dashboard/share">← 共有一覧へ戻る</Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">読み込みに失敗しました</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <div>共有詳細の取得に失敗しました（HTTP {detail.res.status}）。</div>
            {detail.errMsg ? <div className="text-xs">詳細: {detail.errMsg}</div> : null}
          </CardContent>
        </Card>
      </main>
    );
  }

  const item = detail.data;

  const shareId = (item.id ?? id).trim();
  const title = (item.title ?? "").trim() || "（無題）";
  const body = (item.body ?? "").trim();
  const publicPath = `/share/${shareId}`;
  const base = getBaseUrlFromHeaders();
  const publicUrl = new URL(publicPath, base).toString();
  const created = fmtJp(item.createdAt);
  const updated = fmtJp(item.updatedAt);

  return (
    <main className="container mx-auto max-w-4xl py-6 space-y-6">
      <div className="space-y-2">
        <nav aria-label="breadcrumb" className="text-sm text-muted-foreground">
          <Link href="/dashboard" className="hover:text-foreground hover:underline">
            ダッシュボード
          </Link>
          <span className="mx-2" aria-hidden="true">
            ＞
          </span>
          <Link href="/dashboard/share" className="hover:text-foreground hover:underline">
            共有
          </Link>
          <span className="mx-2" aria-hidden="true">
            ＞
          </span>
          <span className="text-foreground">管理</span>
        </nav>

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold">共有の管理</h1>
            <p className="text-sm text-muted-foreground">
              公開/非公開の切替、共有URLのコピー、本文の確認とコピーができます。
            </p>
          </div>

          <Button variant="ghost" asChild className="px-0 shrink-0">
            <Link href="/dashboard/share">← 共有一覧へ戻る</Link>
          </Button>
        </div>
      </div>

      <Card className="rounded-xl shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-base">{title}</CardTitle>
              <div className="text-xs text-muted-foreground">
                {updated ? `最終更新: ${updated}` : created ? `作成: ${created}` : ""}
              </div>
            </div>

            <div className="text-xs">
              <span
                className={`inline-flex items-center rounded-full px-2 py-1 ${
                  item.isPublic ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                }`}
              >
                {item.isPublic ? "公開中" : "非公開"}
              </span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 text-sm">
          <dl className="grid grid-cols-[110px_1fr] gap-x-4 gap-y-2">
            <dt className="text-muted-foreground">状態</dt>
            <dd className="font-medium">{item.isPublic ? "公開" : "非公開"}</dd>

            <dt className="text-muted-foreground">共有URL</dt>
            <dd className="space-y-2">
              <div className="flex flex-col gap-2">
                <div className="font-mono break-all">{publicUrl}</div>

                {!item.isPublic ? (
                  <div className="text-xs text-muted-foreground">
                    ※ 非公開のままでもURLはコピーできますが、相手は閲覧できません。公開にしてから共有してください。
                  </div>
                ) : null}
              </div>
            </dd>
          </dl>

          <ShareAdminActions
            shareId={shareId}
            isPublic={item.isPublic}
            publicPath={publicPath}
            publicUrl={publicUrl}
            isDev={isDev}
            devUserId={devUserId}
          />
        </CardContent>
      </Card>

      <Card className="rounded-xl shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base">本文</CardTitle>

            <ShareAdminBodyCopyButton body={body} />
          </div>
        </CardHeader>

        <CardContent className="text-sm">
          {body ? (
            <pre className="whitespace-pre-wrap leading-6 rounded-lg border bg-muted/30 p-4">{body}</pre>
          ) : (
            <p className="text-muted-foreground">（本文がありません）</p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
