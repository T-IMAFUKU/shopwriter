"use client";

import * as React from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";

type PageProps = { params: { id: string } };

export default function ShareDetailPage({ params }: PageProps) {
  const { id } = params;

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(id);
      notify("ID をコピーしました", "success");
    } catch {
      notify("コピーに失敗しました", "error");
    }
  };

  return (
    <main className="container mx-auto max-w-3xl py-8 space-y-6">
      {/* Header */}
      <section className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Share 詳細</h1>
        <p className="text-sm text-muted-foreground">
          公開中の Share 情報を確認します。
        </p>
      </section>

      {/* 基本情報 */}
      <Card className="rounded-xl shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">基本情報</CardTitle>
            <Button size="sm" variant="outline" onClick={copyId}>
              ID をコピー
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <dl className="grid grid-cols-[80px_1fr] gap-x-4 gap-y-2">
            <dt className="text-muted-foreground">ID</dt>
            <dd className="text-lg font-mono">{id}</dd>
          </dl>
          <p className="text-muted-foreground">
            ※ ここはルーティング確認用の最小ページです。実データ接続は
            「MVP: テンプレ管理（CRUD）」で実装します。
          </p>
        </CardContent>
      </Card>

      {/* 戻る導線（UIトークン準拠のリンクボタン） */}
      <div>
        <Button variant="link" asChild className="px-0">
          <Link href="/">← トップへ戻る</Link>
        </Button>
      </div>
    </main>
  );
}
