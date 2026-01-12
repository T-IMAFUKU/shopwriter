// components/dashboard/DashboardGrid.tsx
// 入口整備フェーズ⑤（ダッシュボード実装）
// L2-02: DashboardGrid（レベル2のレイアウト骨格）
//
// 役割:
// - カードを“置く場所”だけを決める（中身は後続 L2-03〜07）
// - レベル3（計測）要素は置かない（重い表/チャート禁止）
// - 密度ルールは各カードで守る（ここは骨格のみ）

import * as React from "react";

export type DashboardGridProps = {
  quickActions: React.ReactNode; // L2-03
  helpHub: React.ReactNode; // L2-04
  recentActivity: React.ReactNode; // L2-05
  accountStatus: React.ReactNode; // L2-06（枠のみ）
  usageSummary: React.ReactNode; // L2-07（未計測表示）
};

export function DashboardGrid({
  quickActions,
  helpHub,
  recentActivity,
  accountStatus,
  usageSummary,
}: DashboardGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-12 md:gap-6">
      {/* 主役：よく使う機能（文章作成/商品情報管理） */}
      <section className="md:col-span-8" aria-label="quick-actions">
        {quickActions}
      </section>

      {/* 準主役：アカウント状態 */}
      <section className="md:col-span-4" aria-label="account-status">
        {accountStatus}
      </section>

      {/* 準主役：利用状況 */}
      <section className="md:col-span-4" aria-label="usage-summary">
        {usageSummary}
      </section>

      {/* 軽量：最近のアクティビティ */}
      <section className="md:col-span-8" aria-label="recent-activity">
        {recentActivity}
      </section>

      {/* 集約：ヘルプ入口 */}
      <section className="md:col-span-12" aria-label="help-hub">
        {helpHub}
      </section>
    </div>
  );
}
