// app/share/[id]/page.tsx
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import Script from "next/script";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "ShopWriter — Share",
  description: "Shared page",
};

type SharePayload = {
  id: string;
  title: string;
  content: string;
  isPublic?: boolean;
  createdAt?: string;
  updatedAt?: string;
  authorName?: string | null;
  expiresAt?: string | null;
};

function getBaseUrl() {
  const h = headers();
  const protocol =
    h.get("x-forwarded-proto") ??
    (process.env.NODE_ENV === "production" ? "https" : "http");
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${protocol}://${host}`;
}

async function fetchShare(id: string): Promise<{ data: SharePayload | null; status: number }> {
  const base = getBaseUrl();
  const res = await fetch(`${base}/api/shares/${id}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  if (res.status === 404) return { data: null, status: 404 };
  if (res.status === 403) return { data: null, status: 403 };
  if (!res.ok) return { data: null, status: 404 };

  const json = (await res.json()) as SharePayload;
  return { data: json, status: 200 };
}

export default async function SharePage({ params }: { params: { id: string } }) {
  const shareId = params.id;
  const { data, status } = await fetchShare(shareId);
  const base = getBaseUrl();
  const shareUrl = `${base}/share/${shareId}`;

  if (status === 404) notFound();

  if (status === 403 || (data && data.isPublic === false)) {
    return (
      <main className="min-h-[100dvh] bg-background text-foreground flex items-center justify-center p-6">
        <section
          className="w-full max-w-xl rounded-2xl border border-border/60 bg-card shadow-sm"
          role="region"
          aria-labelledby="forbidden-heading"
        >
          <header className="px-6 pt-6">
            <h1 id="forbidden-heading" className="text-xl font-semibold">
              この共有は現在 <span className="text-red-600">非公開</span> です（403）
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              発行者が共有を無効化している可能性があります。必要に応じて発行者へご連絡ください。
            </p>
          </header>
          <div className="px-6 py-5">
            <div className="rounded-lg bg-muted/40 px-4 py-3 text-sm leading-6">
              <div className="font-medium">Share ID</div>
              <div className="select-all break-all text-muted-foreground">{shareId}</div>
            </div>
          </div>
          <footer className="flex items-center justify-end gap-3 px-6 pb-6">
            <a
              href="/"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-input bg-background px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="ホームに戻る"
            >
              ホームへ
            </a>
          </footer>
        </section>
      </main>
    );
  }

  const title = data?.title ?? "Untitled";
  const content = data?.content ?? "";

  return (
    <main className="min-h-[100dvh] bg-background text-foreground">
      <section className="container mx-auto max-w-3xl p-6">
        {/* ヘッダー */}
        <header
          className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"
          role="region"
          aria-label="共有ヘッダー"
        >
          <div>
            <h1 className="text-2xl font-semibold leading-tight">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Share ID: <span className="select-all align-middle">{data?.id}</span>
            </p>
          </div>

          {/* URLコピー */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-copy-url
              data-url={shareUrl}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="共有URLをコピー"
            >
              URLをコピー
            </button>
          </div>
        </header>

        {/* 本文 */}
        <article
          className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm"
          role="article"
          aria-label="共有コンテンツ"
        >
          <div className="prose max-w-none prose-p:my-0 dark:prose-invert">
            {content ? (
              <pre className="whitespace-pre-wrap break-words text-sm leading-6">{content}</pre>
            ) : (
              <p className="text-sm text-muted-foreground">コンテンツがまだありません。</p>
            )}
          </div>
        </article>

        {/* フッタ（メタ情報） */}
        <footer className="mt-6 text-xs text-muted-foreground">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {data?.authorName && (
              <span aria-label="作成者">
                Author: <span className="font-medium">{data.authorName}</span>
              </span>
            )}
            {data?.createdAt && <span aria-label="作成日時">Created: {new Date(data.createdAt).toLocaleString()}</span>}
            {data?.updatedAt && <span aria-label="更新日時">Updated: {new Date(data.updatedAt).toLocaleString()}</span>}
          </div>
        </footer>
      </section>

      {/* クリップボード（フォールバック付）＋ トースト（window.sonnerToast）＋ 簡易トラッキング */}
      <Script id="share-copy-handler" strategy="afterInteractive">{`
        (function () {
          // textarea フォールバック
          function fallbackCopy(text) {
            try {
              var ta = document.createElement('textarea');
              ta.value = text;
              ta.setAttribute('readonly', '');
              ta.style.position = 'fixed';
              ta.style.top = '-1000px';
              ta.style.opacity = '0';
              document.body.appendChild(ta);
              ta.focus();
              ta.select();
              var ok = document.execCommand('copy');
              document.body.removeChild(ta);
              return !!ok;
            } catch (_) { return false; }
          }

          async function copyUrl(url) {
            try { window.focus(); } catch (_) {}
            var canClipboard = !!(navigator && navigator.clipboard && window.isSecureContext);
            var hasFocus = !!document.hasFocus && document.hasFocus();

            if (canClipboard && hasFocus) {
              try {
                await navigator.clipboard.writeText(url);
                return true;
              } catch (_) { /* フォールバックへ */ }
            }
            return fallbackCopy(url);
          }

          function toastSuccess(msg){ try{ window.sonnerToast?.success?.(msg, { duration: 1600 }); }catch(_){} }
          function toastError(msg){ try{ window.sonnerToast?.error?.(msg, { duration: 1800 }); }catch(_){} }

          function onClick(e) {
            var btn = e.target && e.target.closest('[data-copy-url]');
            if (!btn) return;
            var url = btn.getAttribute('data-url') || window.location.href;

            copyUrl(url).then(function(ok){
              if (ok) { toastSuccess('URLをコピーしました'); }
              else { toastError('コピーに失敗しました'); }

              try {
                console.info('[analytics] share_copy_clicked', {
                  shareId: ${JSON.stringify(shareId)},
                  url: url,
                  ok: ok,
                  ts: Date.now()
                });
                window.dispatchEvent(new CustomEvent('sw:event', {
                  detail: { name: 'share_copy_clicked', shareId: ${JSON.stringify(shareId)}, url: url, ok: ok }
                }));
              } catch(_) {}
            });
          }

          if (!window.__SW_SHARE_COPY_BOUND__) {
            window.addEventListener('click', onClick);
            window.__SW_SHARE_COPY_BOUND__ = true;
          }
        })();
      `}</Script>
    </main>
  );
}
