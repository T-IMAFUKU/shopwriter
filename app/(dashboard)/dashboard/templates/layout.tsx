// app/(dashboard)/dashboard/templates/layout.tsx
// Server Component（既定）
// 【CP@2025-09-21.v3】適用：検索クエリ依存のため静的化を回避し、ページ直下をサスペンス境界で包む
export const dynamic = 'force-dynamic';

import * as React from "react";

export default function TemplatesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <React.Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading templates…</div>}>
      {children}
    </React.Suspense>
  );
}
