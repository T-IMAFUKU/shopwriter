'use client';

import * as React from 'react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export type ShareData = {
  id: string;
  title?: string | null;
  content?: string | null;
  createdAt?: string | null;
  expiresAt?: string | null;
  // 追加項目が来ても安全に無視
  [key: string]: unknown;
};

type Props = {
  /** 画面上に表示する共有URL（例：window.location.href） */
  shareUrl: string;
  /** 共有データ本体 */
  data: ShareData;
  /** コピー成功時のフック（未指定ならトースト表示） */
  onCopySuccess?: () => void;
  /** コピー失敗時のフック（未指定ならトースト表示） */
  onCopyError?: (err: unknown) => void;
  /** className を上位で追加したい場合に使用 */
  className?: string;
};

/**
 * ShareCard
 * - 上段：共有URL + 「URLをコピー」ボタン
 * - 下段：共有内容の概要（タイトル/本文/メタ情報）
 * - /app/share/[id]/page.tsx から利用する想定のプレゼンテーションコンポーネント
 */
export default function ShareCard({
  shareUrl,
  data,
  onCopySuccess,
  onCopyError,
  className,
}: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      if (onCopySuccess) onCopySuccess();
      else toast.success('URLをコピーしました');
    } catch (err) {
      if (onCopyError) onCopyError(err);
      else toast.error('コピーに失敗しました。ブラウザの権限設定をご確認ください。');
    }
  };

  return (
    <section className={['space-y-4', className].filter(Boolean).join(' ')}>
      {/* 共有URLブロック */}
      <div className="rounded-xl border bg-card p-5">
        <div className="mb-2 text-xs font-medium text-muted-foreground">共有URL</div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <code className="max-w-full overflow-x-auto rounded-md bg-muted px-3 py-2 text-sm">
            {shareUrl}
          </code>
          <div className="shrink-0">
            <Button onClick={handleCopy} aria-label="URLをコピー">
              {copied ? '✓ コピーしました' : 'URLをコピー'}
            </Button>
          </div>
        </div>
      </div>

      {/* 概要ブロック */}
      <div className="rounded-xl border bg-card p-5">
        <div className="mb-2 text-xs font-medium text-muted-foreground">概要</div>
        <h2 className="text-lg font-medium">{data.title ?? `Share #${data.id}`}</h2>

        {data.content && (
          <article className="prose prose-sm max-w-none whitespace-pre-wrap break-words">
            {String(data.content)}
          </article>
        )}

        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">共有ID</dt>
            <dd className="break-all">{data.id}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">作成日時</dt>
            <dd>
              {data.createdAt ? new Date(String(data.createdAt)).toLocaleString() : '-'}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">有効期限</dt>
            <dd>
              {data.expiresAt ? new Date(String(data.expiresAt)).toLocaleString() : '（設定なし）'}
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
