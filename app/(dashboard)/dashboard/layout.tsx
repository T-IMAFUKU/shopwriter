// app/(dashboard)/dashboard/layout.tsx
// 入口整備フェーズ⑤（ダッシュボード実装）
// L2-01: ページ枠（レベル2ダッシュボード用の“枠”を確定）
//
// 方針:
// - レベル2は「軽量・集約・短い説明」。重い表や長文は置かない。
// - 未実装導線は原則出さない（例外のみ“準備中（非活性）”はカード側で扱う）。
// - 本ファイルは“枠”のみ。Grid/カードは後続 L2-02〜で実装。

import * as React from "react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-8">
      {/* ヘッダー（枠のみ：説明は短く） */}
      <header className="mb-6 md:mb-8">
        <h1 className="text-[22px] font-semibold tracking-tight md:text-[26px]">
          ダッシュボード
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          アカウント状況と、よく使う機能をまとめて確認できます。
        </p>
      </header>

      {/* 本文（L2-02以降で Grid/カードを配置） */}
      <main className="space-y-6" role="main">
        {children}
      </main>
    </section>
  );
}
