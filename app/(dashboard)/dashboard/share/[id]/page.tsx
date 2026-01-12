// app/(dashboard)/dashboard/share/[id]/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { notFound } from "next/navigation";
import { cookies, headers } from "next/headers";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
  const cookie = cookies().toString();
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

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              id="sw-toggle-public"
              variant={item.isPublic ? "outline" : "primary"}
              data-share-id={shareId}
              data-next-is-public={item.isPublic ? "false" : "true"}
              data-is-dev={isDev ? "true" : "false"}
              data-dev-user-id={devUserId ?? ""}
              aria-label="公開/非公開を切り替える"
            >
              {item.isPublic ? "非公開にする" : "公開にする"}
            </Button>

            <Button
              type="button"
              id="sw-copy-url"
              variant="secondary"
              data-copy-text={publicUrl}
              aria-label="共有URLをコピー"
            >
              共有URLをコピー
            </Button>

            <Button asChild variant="outline">
              <Link href={publicPath} prefetch={false}>
                公開ページを見る
              </Link>
            </Button>

            <span id="sw-action-msg" className="text-xs text-muted-foreground self-center pl-1" />
          </div>

          <div id="sw-action-err" className="hidden text-xs text-destructive" />
        </CardContent>
      </Card>

      <Card className="rounded-xl shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base">本文</CardTitle>

            <Button
              type="button"
              id="sw-copy-body"
              variant="secondary"
              disabled={!body}
              aria-disabled={!body}
              data-copy-text={body}
              aria-label="本文をコピー"
            >
              本文をコピー
            </Button>
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

      <Script id="sw-share-admin-actions" strategy="afterInteractive">
        {`
(() => {
  const msgEl = document.getElementById("sw-action-msg");
  const errEl = document.getElementById("sw-action-err");

  const setMsg = (t) => { if (msgEl) msgEl.textContent = t || ""; };
  const setErr = (t) => {
    if (!errEl) return;
    if (!t) { errEl.classList.add("hidden"); errEl.textContent = ""; return; }
    errEl.classList.remove("hidden");
    errEl.textContent = t;
  };

  const copyText = async (text) => {
    setErr("");
    try {
      if (!text) throw new Error("コピーする内容がありません。");
      if (!navigator.clipboard) throw new Error("このブラウザではクリップボードAPIが使えません。");
      await navigator.clipboard.writeText(text);
      setMsg("コピーしました");
      window.setTimeout(() => setMsg(""), 1500);
    } catch (e) {
      setErr(e?.message || "コピーに失敗しました。");
    }
  };

  const copyUrlBtn = document.getElementById("sw-copy-url");
  if (copyUrlBtn) copyUrlBtn.addEventListener("click", async () => {
    await copyText(copyUrlBtn.getAttribute("data-copy-text") || "");
  });

  const copyBodyBtn = document.getElementById("sw-copy-body");
  if (copyBodyBtn) copyBodyBtn.addEventListener("click", async () => {
    await copyText(copyBodyBtn.getAttribute("data-copy-text") || "");
  });

  const readErrMsg = async (res) => {
    try {
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        const j = await res.json();
        return (j && (j.error || j.message)) ? String(j.error || j.message) : "";
      }
      return (await res.text()).slice(0, 200);
    } catch {
      return "";
    }
  };

  const patchTry = async (url, payload, extraHeaders) => {
    return fetch(url, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "accept": "application/json",
        ...(extraHeaders || {}),
      },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    });
  };

  const toggleBtn = document.getElementById("sw-toggle-public");
  if (toggleBtn) toggleBtn.addEventListener("click", async () => {
    setErr("");
    setMsg("切り替え中…");

    const id = toggleBtn.getAttribute("data-share-id");
    const nextIsPublic = toggleBtn.getAttribute("data-next-is-public") === "true";

    const isDev = toggleBtn.getAttribute("data-is-dev") === "true";
    const devUserId = toggleBtn.getAttribute("data-dev-user-id") || "";

    if (!id) {
      setMsg("");
      setErr("share id が取得できません。");
      return;
    }

    const extraHeaders = {};
    if (isDev && devUserId) {
      extraHeaders["x-user-id"] = devUserId;
    }

    try {
      let res = await patchTry(\`/api/shares/\${encodeURIComponent(id)}\`, { isPublic: nextIsPublic }, extraHeaders);

      if (res.status === 405) {
        res = await patchTry("/api/shares", { id, isPublic: nextIsPublic }, extraHeaders);
      }

      if (res.status === 401 || res.status === 403) {
        window.location.href = "/api/auth/signin";
        return;
      }

      if (!res.ok) {
        const m = await readErrMsg(res);
        throw new Error(m || \`切り替えに失敗しました（HTTP \${res.status}）\`);
      }

      setMsg("更新しました");
      window.setTimeout(() => { window.location.reload(); }, 300);
    } catch (e) {
      setMsg("");
      setErr(e?.message || "切り替えに失敗しました。");
    }
  });
})();
        `}
      </Script>
    </main>
  );
}
