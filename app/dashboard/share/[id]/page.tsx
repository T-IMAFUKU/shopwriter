'use client';

import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import ShareCard, { type ShareData } from '@/components/share/ShareCard';

type FetchState =
  | { status: 'idle' | 'loading' }
  | { status: 'success'; data: ShareData }
  | { status: 'error'; message: string; code?: number; raw?: string };

export default function DashboardSharePreviewPage({ params }: { params: { id: string } }) {
  const shareId = params.id;
  const [state, setState] = useState<FetchState>({ status: 'idle' });

  // 表示用URL（ダッシュボード上でのプレビューでも「公開URL」をコピーできるようにする）
  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    // 公開ビューのURLをコピー対象にする（/share/[id]）
    const u = new URL(window.location.href);
    u.pathname = `/share/${shareId}`;
    u.search = '';
    u.hash = '';
    return u.toString();
  }, [shareId]);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      setState({ status: 'loading' });
      try {
        const res = await fetch(`/api/shares/${encodeURIComponent(shareId)}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw Object.assign(new Error(res.statusText), { code: res.status, raw: text });
        }
        const json = (await res.json()) as ShareData;
        if (!alive) return;
        if (!json || !json.id) throw new Error('Invalid share payload');
        setState({ status: 'success', data: json });
      } catch (err: any) {
        if (!alive) return;
        const code: number | undefined = err?.code;
        const raw: string | undefined = err?.raw;
        const base =
          code === 404
            ? '指定された共有は見つかりませんでした。URLを確認してください。'
            : '共有データの読み込みに失敗しました。時間を置いて再度お試しください。';
        setState({
          status: 'error',
          message: base,
          code,
          raw: typeof raw === 'string' && raw.length > 0 ? raw : err?.message,
        });
      }
    };
    run();
    return () => {
      alive = false;
    };
  }, [shareId]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">共有プレビュー</h1>
          <p className="text-sm text-muted-foreground">
            Dashboard から共有内容を確認し、公開URLをコピーできます。
          </p>
        </div>
        <nav className="text-sm">
          <Link href="/share/[id]" as={`/share/${shareId}`} className="underline underline-offset-4">
            公開ページを開く
          </Link>
        </nav>
      </header>

      {state.status === 'error' && (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>読み込みエラー</AlertTitle>
          <AlertDescription className="space-y-2 break-words">
            <p>{state.message}</p>
            {(state.raw || state.code) && (
              <details className="[&_summary]:cursor-pointer text-xs text-muted-foreground">
                <summary>詳細</summary>
                <pre className="mt-1 whitespace-pre-wrap break-words">
{String(state.code ?? '')}{state.code ? ': ' : ''}{state.raw ?? ''}
                </pre>
              </details>
            )}
          </AlertDescription>
        </Alert>
      )}

      {state.status === 'loading' && (
        <section className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
          読み込み中…
        </section>
      )}

      {state.status === 'success' && (
        <ShareCard
          shareUrl={shareUrl}   // 公開URLをコピー対象に
          data={state.data}
          className="space-y-4"
        />
      )}
    </main>
  );
}
