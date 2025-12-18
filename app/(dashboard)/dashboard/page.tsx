/**
 * Dashboard Page（Level 2）
 * 入口整備フェーズ⑤
 * L2-08: 状態/データ接続（カード群を接続）
 *
 * 方針:
 * - ここでは「接続のみ」。実データ取得は行わない。
 * - 未実装/未計測は各カードの統一表示に任せる。
 * - レベル3（計測UI/チャート/表）は置かない。
 *
 * 入口整備フェーズ⑥（UI Polishing）
 * Step1: 設計メモバッジを既定で非表示（debug=1で表示）
 * Step2: バッジらしい要素に限定して誤爆回避
 * Step3（今回）:
 * - 余白/リズムの最終調整（完成感アップ）
 * - 機能追加なし
 * - QuickActions（文章作成/商品情報管理）の“カード内余白”を締めて間延び解消
 */

export const dynamic = "force-dynamic";

import * as React from "react";
import { DashboardGrid } from "@/components/dashboard/DashboardGrid";
import { QuickActionsCard } from "@/components/dashboard/QuickActionsCard";
import { HelpHubCard } from "@/components/dashboard/HelpHubCard";
import { RecentActivityCard } from "@/components/dashboard/RecentActivityCard";
import { AccountStatusSummaryCard } from "@/components/dashboard/AccountStatusSummaryCard";
import { UsageSummaryCard } from "@/components/dashboard/UsageSummaryCard";

type DashboardPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function isDebugOn(searchParams?: DashboardPageProps["searchParams"]) {
  const v = searchParams?.debug;
  if (typeof v === "string") return v === "1";
  if (Array.isArray(v)) return v[0] === "1";
  return false;
}

export default function DashboardPage({ searchParams }: DashboardPageProps) {
  const debug = isDebugOn(searchParams);

  return (
    <div data-sw-dashboard-page="1">
      {/* Step1/2: 設計メモバッジ制御（既定で非表示） */}
      {!debug ? (
        <>
          <style
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{
              __html: `
/* Hide design-note badges by default */
[data-sw-design-note="1"] { display: none !important; }

/* ---- Step3: Polishing ---- */

/* 見出し直下の余白を締めて視線集中 */
[data-sw-dashboard-page="1"] main > div.grid { margin-top: 0.25rem; }

/* セクション間の縦リズムを統一 */
[data-sw-dashboard-page="1"] main[role="main"] > div.grid > section { margin-bottom: 0.75rem; }
@media (min-width: 768px) {
  [data-sw-dashboard-page="1"] main[role="main"] > div.grid > section { margin-bottom: 1rem; }
}

/* カード内の説明文の行間をわずかに安定 */
[data-sw-dashboard-page="1"] .text-muted-foreground { line-height: 1.55; }

/* ===== QuickActions の “間延び” 対策（このセクションだけ） =====
   ねらい：カード内の上下余白と要素間の間隔を締める
   - 既存コンポーネントの Tailwind クラスが何であっても効くよう、広めに当てる
   - 影響範囲は aria-label="quick-actions" 内に限定
*/

/* カード（外枠）に無駄な高さが付いてる場合を潰す */
[data-sw-dashboard-page="1"] section[aria-label="quick-actions"] * {
  min-height: 0;
}

/* Cardの内側 padding が大きい場合を締める（p-6 / py-6 などを上書き） */
[data-sw-dashboard-page="1"] section[aria-label="quick-actions"] [class*="p-6"] {
  padding: 1rem !important;
}
[data-sw-dashboard-page="1"] section[aria-label="quick-actions"] [class*="py-6"] {
  padding-top: 1rem !important;
  padding-bottom: 1rem !important;
}
[data-sw-dashboard-page="1"] section[aria-label="quick-actions"] [class*="pt-6"] {
  padding-top: 1rem !important;
}
[data-sw-dashboard-page="1"] section[aria-label="quick-actions"] [class*="pb-6"] {
  padding-bottom: 1rem !important;
}

/* タイトル/説明とボタン群の間が空きすぎる場合を締める（margin-top系の過剰を抑える） */
[data-sw-dashboard-page="1"] section[aria-label="quick-actions"] [class*="mt-6"] { margin-top: 1rem !important; }
[data-sw-dashboard-page="1"] section[aria-label="quick-actions"] [class*="mt-8"] { margin-top: 1.25rem !important; }

/* ボタン自体も “板っぽい” 高さにならないよう、最低限だけ締める */
[data-sw-dashboard-page="1"] section[aria-label="quick-actions"] a,
[data-sw-dashboard-page="1"] section[aria-label="quick-actions"] button {
  height: 2.75rem !important;      /* 44px */
  min-height: 2.75rem !important;
  padding-top: 0.5rem !important;
  padding-bottom: 0.5rem !important;
}
@media (min-width: 768px) {
  [data-sw-dashboard-page="1"] section[aria-label="quick-actions"] a,
  [data-sw-dashboard-page="1"] section[aria-label="quick-actions"] button {
    height: 3rem !important;       /* 48px */
    min-height: 3rem !important;
  }
}
`,
            }}
          />
          <script
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{
              __html: `
(function () {
  try {
    // ===== Step1/2 共通：設計メモバッジのマーキング =====
    var LABELS = ["準主役", "軽量"];
    var labels = new Set(LABELS);

    function looksLikeBadge(el) {
      if (!el) return false;
      var cls = (el.getAttribute("class") || "").toLowerCase();
      if (!cls) return false;
      var hasPill = cls.indexOf("rounded-full") !== -1;
      var hasTextXs = cls.indexOf("text-xs") !== -1;
      var hasPx = cls.indexOf("px-") !== -1;
      var hasPy = cls.indexOf("py-") !== -1;
      return (hasPill && hasTextXs) || (hasPill && hasPx) || (hasTextXs && hasPx && hasPy);
    }

    function mark(root) {
      if (!root) return;
      var nodes = root.querySelectorAll("div, span, a");
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (!el || el.nodeType !== 1) continue;
        if (el.hasAttribute("data-sw-design-note")) continue;
        var t = (el.textContent || "").trim();
        if (!t || t.length > 6) continue;
        if (!labels.has(t)) continue;
        if (!looksLikeBadge(el)) continue;
        el.setAttribute("data-sw-design-note", "1");
      }
    }

    function boot() {
      var main = document.querySelector("main");
      if (!main) return;
      requestAnimationFrame(function () { mark(main); });
      setTimeout(function () { mark(main); }, 0);
      var obs = new MutationObserver(function () { mark(main); });
      obs.observe(main, { childList: true, subtree: true });
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
      boot();
    }
  } catch (e) {}
})();
`,
            }}
          />
        </>
      ) : null}

      <DashboardGrid
        quickActions={<QuickActionsCard writerHref="/writer" productsHref="/products" />}
        accountStatus={
          <AccountStatusSummaryCard
            statusLabel="未取得"
            hint="アカウント状態は準備中です。"
            primaryActionHref="/account/billing"
            primaryActionLabel="請求情報へ"
          />
        }
        usageSummary={<UsageSummaryCard />}
        recentActivity={<RecentActivityCard />}
        helpHub={<HelpHubCard supportHref="/support" shareGuideHref="/share/guide" />}
      />
    </div>
  );
}
