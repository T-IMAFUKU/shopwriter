"use client";

/**
 * ShopWriter — Home (Top Page, Hero + HowItWorks + Examples + Overview + Final CTA)
 * H-4-③ ブランドブロック統一＋モバイル最適化版
 *
 * 今回（2025-12-26）: トップページの出力プレビュー/生成例を Writer の出力UIに寄せる
 * - 新URL/共有導線は作らない（見た目・構造のみ）
 * - Writer側ロジックは変更しない（必要なら次チャット）
 */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Check,
  ArrowRight,
  Sparkles,
  Search,
  Share2,
  MousePointerClick,
  ListChecks,
  Rocket,
  List as ListIcon,
  FileText,
  UserPlus,
} from "lucide-react";
import { motion } from "framer-motion";
import type { Variants } from "framer-motion";

// 🔵 ヘッダーと同じ正式ロゴを想定
import { Logo } from "@/components/Logo";

// ✅ お知らせ（Hero直下）
import { UpdatesSection } from "@/components/home/UpdatesSection";
import { updates } from "@/data/updates";

/* ===== motion variants ===== */
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

/* =========================================================================
   Hero Backdrop — 軽量化版（既存維持）
   ========================================================================= */
function HeroBackdrop() {
  const [enhanced, setEnhanced] = useState(false);
  useEffect(() => {
    setEnhanced(true);
  }, []);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      {/* ベース：超軽量ラジアル（SSRから描画） */}
      <div className="absolute inset-0 bg-[radial-gradient(60%_70%_at_40%_0%,rgba(14,32,64,0.18),transparent_70%)]" />

      {/* 装飾：CSR後にのみ追加（薄い光彩） */}
      {enhanced && (
        <div
          className="
            absolute -top-28 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full
            bg-[conic-gradient(from_210deg,#0b1a34_0deg,#1e3a8a_120deg,#0b1a34_240deg)]
            opacity-10
            [mask-image:radial-gradient(50%_50%_at_50%_50%,black,transparent_70%)]
            will-change:transform
          "
        />
      )}
    </div>
  );
}

/* ===== 旧ロゴワードマーク (未使用化予定だが将来のため一旦温存) ===== */
function LogoWordmark() {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-2 transition-colors underline-offset-4 hover:underline"
      aria-label="ShopWriter トップへ"
    >
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
    </Link>
  );
}

/* =========================================================================
   Writer寄せ：出力カード（トップのプレビュー/生成例で共通利用）
   - “1枚のカード + ヘッダ行 + 本文(Markdown相当の段落)” の構造に寄せる
   ========================================================================= */
function WriterOutputCard({
  title,
  status,
  children,
}: {
  title: string;
  status?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="relative rounded-2xl border bg-white/70 shadow-sm backdrop-blur-md transition-all md:hover:shadow-2xl md:hover:-translate-y-[2px] dark:bg-white/10">
      <CardContent className="p-4 md:p-5">
        <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <FileText className="h-4 w-4" aria-hidden />
            {title}
          </span>
          {status ? <span className="inline-flex items-center gap-2">{status}</span> : null}
        </div>

        {/* Writerの“出力エリア”っぽい面 */}
        <div className="rounded-xl border bg-white/60 p-4 md:p-5 shadow-none md:shadow-sm backdrop-blur transition-all md:hover:shadow-md dark:bg-white/10">
          <div
            className="
              text-sm leading-7 md:text-base text-foreground
              whitespace-pre-wrap break-words
            "
          >
            {/* Tailwind Typography がある場合は prose でさらにWriter寄せ（無くても崩れない） */}
            <div className="prose prose-sm md:prose-base prose-slate max-w-none dark:prose-invert">
              {children}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ===== Typing preview（CSR専用の子） ===== */
function HeroTyping() {
  const lines = useMemo(
    () => [
      "北欧デザインのマグカップ — 軽くて割れにくい日常使い。",
      "手になじむマットな質感。電子レンジ・食洗機に対応。",
      "朝のコーヒーが、少し楽しみになる一杯を。",
    ],
    []
  );

  const [displayed, setDisplayed] = useState<string[]>(["", "", ""]);
  const [lIndex, setLIndex] = useState(0);
  const [cIndex, setCIndex] = useState(0);
  const [done, setDone] = useState(false);
  const typingRef = useRef<number | null>(null);

  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  useEffect(() => {
    if (prefersReduced) {
      setDisplayed(lines);
      setDone(true);
      return;
    }

    const SPEED = 28;
    const LINE_DELAY = 520;

    const tick = () => {
      setDisplayed((prev) => {
        const next = [...prev];
        next[lIndex] = lines[lIndex].slice(0, cIndex + 1);
        return next;
      });
      setCIndex((v) => v + 1);
    };

    if (lIndex < lines.length) {
      if (cIndex < lines[lIndex].length) {
        typingRef.current = window.setTimeout(tick, SPEED);
      } else {
        window.setTimeout(() => {
          if (lIndex + 1 < lines.length) {
            setLIndex((i) => i + 1);
            setCIndex(0);
          } else {
            setDone(true);
          }
        }, LINE_DELAY);
      }
    }

    return () => {
      if (typingRef.current) clearTimeout(typingRef.current);
    };
  }, [cIndex, lIndex, lines, prefersReduced]);

  // Writerの出力っぽく「1枚の文章」として見せる（行ごとのピルは廃止）
  const text = displayed.filter(Boolean).join("\n\n");

  return (
    <WriterOutputCard
      title="AI出力プレビュー"
      status={
        !prefersReduced ? (
          <span aria-live="polite" className="inline-flex items-center gap-1">
            {done ? "生成完了" : "生成中"}
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary/70" aria-hidden />
          </span>
        ) : null
      }
    >
      <p>
        {text}
        {!prefersReduced && !done ? (
          <span className="ml-0.5 inline-block w-3 animate-pulse select-none" aria-hidden>
            |
          </span>
        ) : null}
      </p>
    </WriterOutputCard>
  );
}

/* ===== 親：Hydration-safe（既存維持） ===== */
function HeroMock() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <motion.div
      variants={scaleIn}
      initial={false}
      whileInView="show"
      viewport={{ once: true, amount: 0.7 }}
      className="relative mx-auto max-w-xs md:max-w-sm"
      role="img"
      aria-label={mounted ? "AI出力プレビュー（タイピング）" : "AI出力プレビュー（読み込み中）"}
    >
      {mounted ? (
        <HeroTyping />
      ) : (
        <WriterOutputCard title="AI出力プレビュー">
          <div className="space-y-2" aria-hidden>
            <div className="h-3 w-28 rounded-full bg-slate-200/60" />
            <div className="h-3 w-40 rounded-full bg-slate-200/60" />
            <div className="h-3 w-24 rounded-full bg-slate-200/60" />
          </div>
        </WriterOutputCard>
      )}
    </motion.div>
  );
}

/* ===== 共通クラス ===== */
const cardClass =
  "rounded-2xl shadow-none transition-all hover:md:shadow-lg hover:md:-translate-y-[2px]";
const cardPadding = "p-4 md:p-6";
const btnPrimary =
  "rounded-xl shadow-sm md:shadow-md bg-gradient-to-r from-indigo-600 to-blue-600 text-white transition-all duration-200 hover:brightness-110 hover:-translate-y-[1px] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500";
const btnRegister =
  "rounded-xl shadow-sm md:shadow-md bg-primary text-primary-foreground transition-all duration-200 hover:bg-primary/90 hover:-translate-y-[1px] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500";
const btnOutline =
  "rounded-xl border-primary/40 text-primary transition-all duration-200 hover:bg-primary/10 hover:brightness-110 hover:-translate-y-[1px] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500";
const linkText = "transition-colors underline-offset-4 hover:underline";

/* ===== 使い方3ステップ ===== */
function HowItWorks() {
  const steps = [
    {
      icon: MousePointerClick,
      title: "入力する",
      desc: "商品やサービスの要点を、フォームに沿って入力。話し言葉でもOKです。",
    },
    {
      icon: ListChecks,
      title: "AIが整える",
      desc: "構成・見出し・導入文まで自動で提案。自然な日本語と読みやすい流れに。",
    },
    {
      icon: Rocket,
      title: "仕上げて公開",
      desc: "必要な部分だけ微調整。共有URLでレビューし、そのまま公開へ。",
    },
  ] as const;

  return (
    <section
      aria-labelledby="howitworks-title"
      className="mx-auto max-w-7xl px-4 md:px-6 pt-4 md:pt-8 pb-2 md:pb-6 [content-visibility:auto]"
    >
      <div className="mb-4 md:mb-7">
        <h2 id="howitworks-title" className="text-lg md:text-2xl font-semibold tracking-tight">
          使い方は、3ステップ
        </h2>
        <p className="mt-1 text-sm text-muted-foreground md:text-base">
          はじめてでも迷いません。ブラウザだけで完結します。
        </p>
      </div>

      <div
        className="grid grid-cols-1 gap-3 md:gap-6 md:grid-cols-3"
        role="list"
        aria-label="使い方の手順"
      >
        {steps.map((s, i) => (
          <motion.div
            key={s.title}
            variants={fadeUp}
            initial={false}
            whileInView="show"
            viewport={{ once: true, amount: 0.2, margin: "0px 0px -10% 0px" }}
            custom={i}
            role="listitem"
          >
            <Card className={cardClass}>
              <CardContent className={cardPadding}>
                <div
                  className="mb-3 md:mb-4 inline-flex h-9 w-9 md:h-10 md:w-10 items-center justify-center rounded-xl bg-primary/10"
                  aria-hidden
                >
                  <s.icon className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span aria-hidden className="text-xs md:text-sm font-semibold text-primary">
                    Step {i + 1}
                  </span>
                  <h3 className="text-base md:text-lg font-semibold">{s.title}</h3>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground md:text-base">
                  {s.desc}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* ===== 生成例（入力 → 生成結果） ===== */
function Examples() {
  return (
    <section
      id="examples"
      aria-labelledby="examples-title"
      className="mx-auto max-w-7xl px-4 md:px-6 py-6 md:py-10 [content-visibility:auto]"
    >
      <div className="mb-5 md:mb-8">
        <h2 id="examples-title" className="text-lg md:text-2xl font-semibold tracking-tight">
          生成例（入力から出力まで）
        </h2>
        <p className="mt-1 text-sm text-muted-foreground md:text-base">
          実際の出力イメージです。入力の要点から、流れのある文章に整えます。
        </p>
      </div>

      <motion.div
        variants={fadeUp}
        initial={false}
        whileInView="show"
        viewport={{ once: true, amount: 0.25, margin: "0px 0px -10% 0px" }}
        className="grid grid-cols-1 gap-3 md:gap-6 md:grid-cols-2"
      >
        {/* 入力（要点） */}
        <Card className={cardClass}>
          <CardContent className={cardPadding}>
            <div className="mb-3 md:mb-4 flex items-center gap-2 text-sm font-semibold">
              <ListIcon className="h-5 w-5 text-primary" aria-hidden />
              入力（要点）
            </div>
            <ul className="space-y-2 text-sm md:text-base" role="list" aria-label="入力の要点">
              <li className="flex gap-2" role="listitem">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary/60" aria-hidden />
                北欧デザインのマグカップ／軽量・割れにくい日常使い。
              </li>
              <li className="flex gap-2" role="listitem">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary/60" aria-hidden />
                手になじむマットな質感。電子レンジ・食洗機に対応。
              </li>
              <li className="flex gap-2" role="listitem">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary/60" aria-hidden />
                朝のコーヒーが、少し楽しみになる一杯を。
              </li>
            </ul>
            <p className="mt-3 md:mt-4 text-xs text-muted-foreground">
              入力は話し言葉でもOK。フォームに沿って答えるだけです。
            </p>
          </CardContent>
        </Card>

        {/* 生成結果（Writer寄せ） */}
        <div className="md:pt-0">
          <WriterOutputCard title="生成結果（抜粋）">
            <h3>北欧デザインのマグカップ</h3>
            <p>
              北欧らしいすっきりとしたフォルムに、手になじむマットな質感。
              軽くて割れにくいので、毎日の相棒にぴったりです。
            </p>
            <ul>
              <li>電子レンジ・食洗機に対応</li>
              <li>日常使いにちょうどいい軽さ</li>
              <li>朝のコーヒーが少し楽しみになる一杯</li>
            </ul>
            <p className="text-muted-foreground">
              ※ この体裁（見出し/段落/箇条書き）は、Writerの出力表示に寄せたプレビューです。
            </p>
          </WriterOutputCard>
        </div>
      </motion.div>

      {/* 例の下CTA（既存維持） */}
      <div className="mt-5 md:mt-6 flex flex-wrap items-center gap-3">
        <Link href="/writer" className={linkText} aria-label="無料で文章をつくってみる（生成例を試す）">
          <Button size="lg" className={btnPrimary + " h-10 md:h-11 px-5 md:px-6"}>
            無料で文章をつくってみる
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
          </Button>
        </Link>

        <Link href="#examples" className={linkText} aria-label="他のサンプルを見る（このページの生成例へ）">
          <Button size="lg" variant="secondary" className={btnOutline + " h-10 md:h-11 px-5 md:px-6"}>
            他のサンプルを見る
          </Button>
        </Link>
      </div>
    </section>
  );
}

/* ===== トラストバー ===== */
function TrustBar() {
  return (
    <div
      className="mt-3 md:mt-4 flex flex-wrap items-center gap-x-5 md:gap-x-6 gap-y-2 text-[11px] md:text-xs text-muted-foreground"
      role="list"
      aria-label="採用技術"
    >
      <span role="listitem" className="font-medium">
        Neon × Prisma
      </span>
      <span role="listitem" className="font-medium">
        NextAuth (GitHub OAuth)
      </span>
      <span role="listitem" className="font-medium">
        Vercel
      </span>
      <span role="listitem" className="font-medium">
        shadcn/ui
      </span>
    </div>
  );
}

/* ===== サービス概要（3カラム） ===== */
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
  ] as const;

  return (
    <section
      aria-labelledby="features-heading"
      className="mx-auto max-w-7xl px-4 md:px-6 py-8 md:py-14 [content-visibility:auto]"
    >
      <div className="mb-5 md:mb-8">
        <h2 id="features-heading" className="text-lg md:text-2xl font-semibold tracking-tight">
          サービス概要
        </h2>
        <p className="mt-1 text-sm text-muted-foreground md:text-base">
          説明文ではなく、魅力が伝わる文章をだれでも。ShopWriterが下書きから公開前のレビューまで支えます。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:gap-6 md:grid-cols-3" role="list">
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
            <Card
              className={cardClass}
              aria-labelledby={`feature-${i}-title`}
              aria-describedby={`feature-${i}-desc`}
            >
              <CardContent className={cardPadding}>
                <div
                  className="mb-3 md:mb-4 inline-flex h-9 w-9 md:h-10 md:w-10 items-center justify-center rounded-xl bg-primary/10"
                  aria-hidden
                >
                  <it.icon className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                </div>
                <h3 id={`feature-${i}-title`} className="text-base md:text-lg font-semibold">
                  {it.title}
                </h3>
                <p
                  id={`feature-${i}-desc`}
                  className="mt-2 text-sm leading-6 text-muted-foreground md:text-base"
                >
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

/* ===== 最終CTA ===== */
function FinalCTA() {
  return (
    <section
      aria-labelledby="final-cta-title"
      className="mx-auto max-w-7xl px-4 md:px-6 pb-14 md:pb-24 [content-visibility:auto]"
    >
      <motion.div
        variants={scaleIn}
        initial={false}
        whileInView="show"
        viewport={{ once: true, amount: 0.25, margin: "0px 0px -10% 0px" }}
        className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-white to-white/60 p-5 md:p-10 shadow-none md:shadow-sm backdrop-blur dark:from-white/5 dark:to-white/10"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 right-0 h-40 md:h-48 w-40 md:w-48 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(37,99,235,0.14),transparent_60%)]"
        />
        <div className="flex flex-col items-start gap-3 md:gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 id="final-cta-title" className="text-lg md:text-2xl font-bold tracking-tight">
              文章づくりを、もっとやさしく。
            </h3>
            <p className="mt-1 text-sm text-muted-foreground md:text-base">
              まずは下書きから。あなたが話す“商品の魅力”を、AIが流れの良い文章に整えます。
            </p>
          </div>

          {/* ✅ 並び順：無料 → 登録 → デモ */}
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/writer" className={linkText} aria-label="無料で試す">
              <Button size="lg" className={btnPrimary + " h-10 md:h-11 px-5 md:px-6"}>
                無料で試す
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
              </Button>
            </Link>

            <Link href="/login" className={linkText} aria-label="ユーザー登録はこちら（ログイン・アカウント登録ガイドへ）">
              <Button size="lg" className={btnRegister + " h-10 md:h-11 px-5 md:px-6"}>
                <UserPlus className="mr-2 h-4 w-4" aria-hidden />
                ユーザー登録はこちら
              </Button>
            </Link>

            <Link href="#examples" className={linkText} aria-label="デモを見る（このページの生成例へ）">
              <Button size="lg" variant="secondary" className={btnOutline + " h-10 md:h-11 px-5 md:px-6"}>
                デモを見る
              </Button>
            </Link>
          </div>
        </div>
      </motion.div>
    </section>
  );
}

/* ===== ページ本体 ===== */
export default function HomePage() {
  return (
    <main className="relative" aria-labelledby="hero-title">
      {/* ===== Hero ===== */}
      <section id="hero" className="relative overflow-hidden" aria-labelledby="hero-title">
        <HeroBackdrop />

        {/* Hero内コンテナ: 余白をH-4-③仕様に合わせて更新 */}
        <div className="mx-auto max-w-7xl px-4 sm:px-8 py-12 sm:py-20">
          <div className="grid grid-cols-12 items-center gap-6 md:gap-8">
            {/* 左：テキスト */}
            <div className="col-span-12 space-y-4 md:space-y-5 md:col-span-7">
              {/* ブランドブロック（ヘッダと同じ / βバッジ廃止） */}
              <motion.div
                variants={fadeUp}
                initial={false}
                whileInView="show"
                viewport={{ once: true, amount: 0.9 }}
                custom={0}
                className="inline-flex"
              >
                <span className="inline-flex items-center gap-1">
                  <Logo variant="icon" size="md" className="shrink-0" priority={true} />
                  <span className="text-[#0A1F61] font-semibold text-base sm:text-lg leading-none">
                    ShopWriter
                  </span>
                </span>
              </motion.div>

              {/* H1 */}
              <motion.h1
                id="hero-title"
                variants={fadeUp}
                initial={false}
                whileInView="show"
                viewport={{ once: true, amount: 0.9 }}
                custom={1}
                className="whitespace-pre-line text-[2rem] leading-[1.3] font-bold tracking-tight text-foreground
                           sm:text-5xl sm:leading-tight
                           md:text-6xl md:leading-tight max-w-3xl"
              >
                {"届く文章を、AIがデザインする。"}
              </motion.h1>

              {/* サブコピー */}
              <motion.p
                variants={fadeUp}
                initial={false}
                whileInView="show"
                viewport={{ once: true, amount: 0.9 }}
                custom={2}
                className="mt-7 text-base sm:text-lg leading-relaxed text-foreground/80 max-w-2xl"
              >
                ShopWriterは、商品説明文をスピーディーに整えるAIライティングツールです。登録なしですぐに試せます。
              </motion.p>

              {/* USP 3点 */}
              <motion.ul
                variants={fadeUp}
                initial={false}
                whileInView="show"
                viewport={{ once: true, amount: 0.9 }}
                custom={3}
                className="space-y-2 md:space-y-2 text-sm md:text-base"
                role="list"
                aria-label="主な特長"
              >
                {[
                  "入力するだけで構成付きの下書きを自動生成",
                  "自然な日本語と読みやすい流れを素早く提案",
                  "レビューは共有URLでスムーズに依頼",
                ].map((t, i) => (
                  <li key={i} className="flex items-start gap-2" role="listitem">
                    <Check className="mt-0.5 h-5 w-5 text-primary" aria-hidden />
                    <span>{t}</span>
                  </li>
                ))}
              </motion.ul>

              {/* CTA（✅ 並び順：無料 → 登録 → デモ） */}
              <motion.div
                variants={fadeUp}
                initial={false}
                whileInView="show"
                viewport={{ once: true, amount: 0.9 }}
                custom={4}
                className="flex flex-col gap-2"
              >
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                  <Link href="/writer" className={linkText} aria-label="無料で文章をつくってみる">
                    <Button size="lg" className={btnPrimary + " h-10 md:h-11 px-5 md:px-6"}>
                      無料で文章をつくってみる
                      <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                    </Button>
                  </Link>

                  <Link
                    href="/login"
                    className={linkText}
                    aria-label="ユーザー登録はこちら（ログイン・アカウント登録ガイドへ）"
                  >
                    <Button size="lg" className={btnRegister + " h-10 md:h-11 px-5 md:px-6"}>
                      <UserPlus className="mr-2 h-4 w-4" aria-hidden />
                      ユーザー登録はこちら
                    </Button>
                  </Link>

                  <Link href="#examples" className={linkText} aria-label="デモを見る（このページの生成例へ）">
                    <Button size="lg" variant="secondary" className={btnOutline + " h-10 md:h-11 px-5 md:px-6"}>
                      デモを見る
                    </Button>
                  </Link>
                </div>
                <p className="text-[11px] md:text-xs text-muted-foreground">
                  ブラウザだけで完結。インストール不要。
                </p>
              </motion.div>

              {/* TrustBar */}
              <motion.div
                variants={fadeUp}
                initial={false}
                whileInView="show"
                viewport={{ once: true, amount: 0.9 }}
                custom={5}
              >
                <TrustBar />
              </motion.div>
            </div>

            {/* 右：タイピングプレビュー（Writer寄せ） */}
            <div className="col-span-12 md:col-span-5">
              <HeroMock />
            </div>
          </div>
        </div>
      </section>

      {/* ✅ お知らせ（Hero直下） */}
      <UpdatesSection items={updates} />

      {/* ===== 使い方3ステップ ===== */}
      <HowItWorks />

      {/* ===== 生成例（入力→生成結果） ===== */}
      <Examples />

      {/* ===== 概要3カラム ===== */}
      <Features />

      {/* ===== 最終CTA ===== */}
      <FinalCTA />
    </main>
  );
}
