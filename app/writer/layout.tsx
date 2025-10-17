import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { HelpCircle, ArrowLeft, Share2, Sparkles, Crown } from "lucide-react";

/**
 * Writer レイアウト
 * - HeroのUIトークンを継承：ガラス調ヘッダ / ヘアライン / 余白・影・半径の統一
 * - 明確な導線：戻る、ヘルプ、共有ドキュメント、料金CTA（販売直結）
 * - 下層の ClientPage（フォーム）/ ResultView（出力）が children に入る
 */

export const metadata: Metadata = {
  title: "Writer | ShopWriter",
  description:
    "商品説明・LP導入文・SNS文面などを最短3ステップで生成。ブランドトーンを維持しながら販売導線へ直結するWriter。",
};

/** UIトークン（Hero継承） */
const TOKENS = {
  radius: {
    md: "rounded-xl",
    lg: "rounded-2xl",
  },
  shadow: {
    base: "shadow-[0_1px_2px_rgba(0,0,0,0.06)]",
    card: "shadow-[0_8px_24px_rgba(0,0,0,0.08)]",
  },
  spacing: {
    section: "py-6 md:py-8",
    page: "px-4 md:px-6",
  },
  glass:
    "backdrop-blur supports-[backdrop-filter]:bg-white/60 bg-white/70 dark:bg-neutral-900/60 border border-white/60 dark:border-white/10",
  hairline: "border-t border-white/60 dark:border-white/10",
} as const;

export default function WriterLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col">
      {/* Glass Header */}
      <header className={["sticky top-0 z-40", TOKENS.glass, TOKENS.shadow.base].join(" ")}>
        <div className={["flex items-center justify-between", TOKENS.spacing.page, "h-14"].join(" ")}>
          {/* Left: Back + Brand */}
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className={[
                "group inline-flex items-center gap-1.5",
                "text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white",
                TOKENS.radius.md,
                "px-2 py-1 transition-colors",
              ].join(" ")}
            >
              <ArrowLeft className="size-4 translate-x-0 group-hover:-translate-x-0.5 transition-transform" />
              <span className="text-sm">戻る</span>
            </Link>

            {/* vertical hairline（Separator 代替） */}
            <div className="mx-1 h-4 w-px bg-neutral-200/70 dark:bg-neutral-800/60" />

            <Link href="/" className="inline-flex items-center gap-2">
              <span className="inline-block size-2.5 bg-gradient-to-br from-indigo-500 to-violet-500 rounded-sm" />
              <span className="font-semibold tracking-tight">ShopWriter</span>
            </Link>

            <span className="ml-2 hidden sm:inline-block text-xs text-neutral-500">Writer</span>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            <Link href="/debug/toaster" className="hidden md:inline-block">
              <Button variant="ghost" size="sm" className="gap-2">
                <HelpCircle className="size-4" />
                ヘルプ
              </Button>
            </Link>

            <Link href="/share/guide" className="hidden md:inline-block">
              <Button variant="ghost" size="sm" className="gap-2">
                <Share2 className="size-4" />
                共有の使い方
              </Button>
            </Link>

            <Link href="/pricing">
              <Button size="sm" className={["gap-2", TOKENS.radius.lg].join(" ")}>
                <Crown className="size-4" />
                プランを見る
              </Button>
            </Link>
          </div>
        </div>

        {/* Sub header: guidance */}
        <div className={[TOKENS.hairline, TOKENS.spacing.page, "py-3"].join(" ")}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                <span className="inline-flex items-center gap-1 font-medium">
                  <Sparkles className="size-4 text-indigo-500" />
                  最短3ステップで構成・話し方・トーンを指定
                </span>
              </p>
              <p className="text-xs text-neutral-500 mt-1">
                入力 → 生成 → 出力 → 共有 → 戻る の導線を最短化。結果は右上からすぐ共有できます。
              </p>
            </div>
            <div className="hidden sm:block text-xs text-neutral-500">βテスト中：フィードバック歓迎</div>
          </div>
        </div>
      </header>

      {/* Page Body */}
      <main className={["flex-1", TOKENS.spacing.page, TOKENS.spacing.section].join(" ")}>
        <div className="mx-auto w-full max-w-5xl">{children}</div>
      </main>

      {/* Footer CTA */}
      <footer className="mt-auto">
        <div className={[TOKENS.hairline, TOKENS.spacing.page, "py-4"].join(" ")}>
          <div className="mx-auto w-full max-w-5xl flex flex-col gap-2 sm:flex-row items-start sm:items-center justify-between">
            <p className="text-xs text-neutral-500">
              生成に満足しましたか？プランをアップグレードして、共有上限・履歴保存・差分比較を解放できます。
            </p>
            <div className="flex gap-2">
              <Link href="/pricing">
                <Button variant="secondary" size="sm" className={TOKENS.radius.md}>
                  料金ページへ
                </Button>
              </Link>
              <Link href="/share/guide">
                <Button variant="ghost" size="sm" className={TOKENS.radius.md}>
                  共有のガイド
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
