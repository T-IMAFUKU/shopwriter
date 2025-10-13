"use client";

/**
 * ShopWriter — Home (Top Page, Hero + Overview + Final CTA)
 * 手13-4c：下部コンテンツの初期不可視を解消（Features/FinalCTA を initial={false} に統一）
 * - Hero/Features/FinalCTA：SSR段階で可視。FMは whileInView で“show”のみ適用。
 */

import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Check, ArrowRight, Sparkles, Search, Share2 } from "lucide-react";
import { motion } from "framer-motion";
import type { Variants } from "framer-motion";

// ====== アニメーション ======
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, delay: 0.05 * i, ease: [0.22, 1, 0.36, 1] },
  }),
};

const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
};

// ====== 背景（控えめグラデ＋ノイズ） ======
function HeroBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_0%,rgba(20,40,80,0.18),transparent_70%)]" />
      <div className="absolute -top-40 left-1/2 h-[540px] w-[540px] -translate-x-1/2 rounded-full bg-[conic-gradient(from_220deg,#0b1f3b_0deg,#2e4b79_120deg,#0b1f3b_240deg)] opacity-[0.08] blur-3xl" />
      <div className="absolute inset-0 opacity-[0.05] [background:repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,0,0,0.06)_3px,transparent_4px)]" />
    </div>
  );
}

// ====== 簡易ワードマーク（SVGエンブレム＋テキスト） ======
function LogoWordmark() {
  return (
    <div className="inline-flex items-center gap-2" aria-label="ShopWriter ロゴ">
      <svg width="24" height="24" viewBox="0 0 24 24" className="shrink-0" aria-hidden>
        <defs>
          <linearGradient id="swg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6366F1" />
            <stop offset="100%" stopColor="#2563EB" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="20" height="20" rx="6" fill="url(#swg)" />
        <path
          d="M7 9c1.2-1 2.5-1.5 4-1.5 1.8 0 3 .8 3 2 0 1-1 1.6-2.8 1.9l-1 .2c-2 .3-3.2 1.2-3.2 2.8 0 2 1.9 3.1 4.6 3.1 1.6 0 3-.4 4.4-1.2"
          fill="none"
          stroke="white"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
      <span className="bg-gradient-to-r from-indigo-500 to-blue-600 bg-clip-text text-lg font-semibold tracking-tight text-transparent md:text-xl">
        ShopWriter
      </span>
    </div>
  );
}

// ====== 右側ビジュアル（ガラス調モック） ======
function HeroMock() {
  return (
    <motion.div
      variants={scaleIn}
      initial={false}
      whileInView="show"
      viewport={{ once: true, amount: 0.7 }}
      className="relative mx-auto max-w-xs md:max-w-sm"
      role="img"
      aria-label="AI出力プレビュー例"
    >
      <Card className="relative rounded-2xl border-white/10 bg-white/70 shadow-xl backdrop-blur-md dark:bg-white/10">
        <CardContent className="p-5">
          <div className="mb-3 text-xs text-muted-foreground">AI出力プレビュー</div>
          <div className="space-y-2" aria-hidden>
            <div className="h-3 w-28 rounded-full bg-gradient-to-r from-slate-300/80 to-slate-200/40 dark:from-slate-700 dark:to-slate-800" />
            <div className="h-3 w-40 rounded-full bg-gradient-to-r from-slate-300/80 to-slate-200/40 dark:from-slate-700 dark:to-slate-800" />
            <div className="h-3 w-24 rounded-full bg-gradient-to-r from-slate-300/80 to-slate-200/40 dark:from-slate-700 dark:to-slate-800" />
          </div>
        </CardContent>
      </Card>
      <div className="absolute -inset-4 -z-10 rounded-[28px] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(59,130,246,0.25),transparent_70%)] blur-2xl" aria-hidden />
    </motion.div>
  );
}

// ====== トラストバー ======
function TrustBar() {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground" role="list">
      <span role="listitem" className="font-medium">Neon × Prisma</span>
      <span role="listitem" className="font-medium">NextAuth (GitHub OAuth)</span>
      <span role="listitem" className="font-medium">Vercel</span>
      <span role="listitem" className="font-medium">shadcn/ui</span>
    </div>
  );
}

// ====== サービス概要（3カラム） ======
function Features() {
  const items = [
    {
      icon: Sparkles,
      title: "“魅力”を引き出す設計",
      desc: "質問に答えるだけ。AIが構成と要点を整理し、伝わる流れに仕上げます。",
    },
    {
      icon: Search,
      title: "検索にも配慮",
      desc: "見出し・要約・導入文を最適化。専門用語は必要な範囲で自然に表現します。",
    },
    {
      icon: Share2,
      title: "かんたん共有＆レビュー",
      desc: "共有URLを送るだけ。下書きの確認やフィードバックがスムーズに。",
    },
  ];
  return (
    <section
      aria-labelledby="features-heading"
      className="mx-auto max-w-7xl px-6 py-10 md:py-14"
    >
      <div className="mb-6 md:mb-8">
        <h2 id="features-heading" className="text-xl font-semibold tracking-tight md:text-2xl">
          サービス概要
        </h2>
        <p className="mt-1 text-sm text-muted-foreground md:text-base">
          説明文ではなく、魅力が伝わる文章をだれでも。ShopWriterが下書きから公開前のレビューまで支えます。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6" role="list">
        {items.map((it, i) => (
          <motion.div
            key={it.title}
            variants={fadeUp}
            initial={false}
            whileInView="show"
            viewport={{ once: true, amount: 0.2, margin: "0px 0px -10% 0px" }}
            custom={i}
            role="listitem"
          >
            <Card className="h-full rounded-2xl" aria-labelledby={`feature-${i}-title`} aria-describedby={`feature-${i}-desc`}>
              <CardContent className="p-6">
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10" aria-hidden>
                  <it.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 id={`feature-${i}-title`} className="text-base font-semibold md:text-lg">
                  {it.title}
                </h3>
                <p id={`feature-${i}-desc`} className="mt-2 text-sm leading-6 text-muted-foreground md:text-base">
                  {it.desc}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

// ====== 最終CTA ======
function FinalCTA() {
  return (
    <section
      aria-labelledby="final-cta-title"
      className="mx-auto max-w-7xl px-6 pb-16 md:pb-24"
    >
      <motion.div
        variants={scaleIn}
        initial={false}
        whileInView="show"
        viewport={{ once: true, amount: 0.25, margin: "0px 0px -10% 0px" }}
        className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-white to-white/60 p-6 shadow-sm backdrop-blur dark:from-white/5 dark:to-white/10 md:p-10"
      >
        <div aria-hidden className="pointer-events-none absolute -top-16 right-0 h-48 w-48 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.18),transparent_60%)]" />
        <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 id="final-cta-title" className="text-xl font-bold tracking-tight md:text-2xl">
              文章づくりを、もっとやさしく。
            </h3>
            <p className="mt-1 text-sm text-muted-foreground md:text-base">
              まずは下書きから。あなたが話す“商品の魅力”を、AIが流れの良い文章に整えます。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/writer" aria-label="無料で試す">
              <Button size="lg" className="rounded-xl shadow-md">
                無料で試す
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
              </Button>
            </Link>
            <Link href="/shares" aria-label="デモを見る">
              <Button size="lg" variant="outline" className="rounded-xl border-primary/30 text-primary hover:bg-primary/10">
                デモを見る
              </Button>
            </Link>
          </div>
        </div>
      </motion.div>
    </section>
  );
}

export default function HomePage() {
  return (
    <main className="relative" aria-labelledby="hero-title">
      {/* ===== Hero ===== */}
      <section id="hero" className="relative overflow-hidden" aria-labelledby="hero-title">
        <HeroBackdrop />

        <div className="mx-auto max-w-7xl px-6 py-20 md:py-28">
          <div className="grid grid-cols-12 items-center gap-8">
            {/* 左：テキスト */}
            <div className="col-span-12 space-y-5 md:col-span-7">
              <motion.div
                variants={fadeUp}
                initial={false}
                whileInView="show"
                viewport={{ once: true, amount: 0.9 }}
                custom={0}
                className="inline-flex"
              >
                <Badge className="rounded-full px-3 py-1" variant="secondary" aria-label="新着">
                  New
                </Badge>
              </motion.div>

              {/* 強化したワードマーク */}
              <motion.div
                variants={fadeUp}
                initial={false}
                whileInView="show"
                viewport={{ once: true, amount: 0.9 }}
                custom={1}
                className="inline-flex"
              >
                <LogoWordmark />
              </motion.div>

              {/* H1（OG画像と同じ改行位置に統一） */}
              <motion.h1
                id="hero-title"
                variants={fadeUp}
                initial={false}
                whileInView="show"
                viewport={{ once: true, amount: 0.9 }}
                custom={2}
                className="whitespace-pre-line text-4xl leading-tight font-bold tracking-tight md:text-6xl"
              >
                {"AIが設計する、あなたの\n商品の魅力と言葉。"}
              </motion.h1>

              {/* サブコピー */}
              <motion.p
                variants={fadeUp}
                initial={false}
                whileInView="show"
                viewport={{ once: true, amount: 0.9 }}
                custom={3}
                className="max-w-2xl text-base text-muted-foreground md:text-lg"
              >
                説明ではなく、魅力が伝わる文章を。あなたは商品について答えるだけ。AIが流れを整え、読みやすく仕上げます。検索にも配慮。
              </motion.p>

              {/* USP 3点 */}
              <motion.ul
                variants={fadeUp}
                initial={false}
                whileInView="show"
                viewport={{ once: true, amount: 0.9 }}
                custom={4}
                className="space-y-3 text-sm sm:space-y-2 md:text-base"
                role="list"
                aria-label="主な特長"
              >
                {[
                  "質問に答えるだけで下書きが完成",
                  "読みやすい見出しと流れを自動で組み立て",
                  "公開前はリンクでかんたん共有・レビュー",
                ].map((t, i) => (
                  <li key={i} className="flex items-start gap-2" role="listitem">
                    <Check className="mt-0.5 h-5 w-5 text-primary" aria-hidden />
                    <span>{t}</span>
                  </li>
                ))}
              </motion.ul>

              {/* CTA */}
              <motion.div
                variants={fadeUp}
                initial={false}
                whileInView="show"
                viewport={{ once: true, amount: 0.9 }}
                custom={5}
                className="flex flex-wrap items-center gap-4"
              >
                <Link href="/writer" aria-label="無料で試す">
                  <Button size="lg" className="rounded-xl shadow-md">
                    無料で試す
                    <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                  </Button>
                </Link>
                <Link href="/shares" aria-label="デモを見る">
                  <Button size="lg" variant="outline" className="rounded-xl border-primary/30 text-primary hover:bg-primary/10">
                    デモを見る
                  </Button>
                </Link>
              </motion.div>

              <motion.div
                variants={fadeUp}
                initial={false}
                whileInView="show"
                viewport={{ once: true, amount: 0.9 }}
                custom={6}
              >
                <TrustBar />
              </motion.div>
            </div>

            {/* 右：ビジュアル */}
            <div className="col-span-12 md:col-span-5">
              <HeroMock />
            </div>
          </div>
        </div>
      </section>

      {/* ===== 概要3カラム ===== */}
      <Features />

      {/* ===== 最終CTA ===== */}
      <FinalCTA />
    </main>
  );
}
