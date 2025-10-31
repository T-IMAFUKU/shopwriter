// app/writer/ClientPage.tsx
// ClientPage = /writer の唯一のインタラクティブ実装(SSOT)
// H-6c PC版Heroガラスカード中央寄せ＋ステップナビ分離
//
// 目的：
// - スマホでは2行固定コピー「あなたの言葉を、 / AIで磨く。」を維持
// - PCではHeroを中央寄せの半透明カード化し、見映えを強化
// - ステップナビをHero外に独立配置して段差をつける
// - スマホ段落崩れ防止のため Markdown→HTML 整形ロジック等は既存維持
// - Precision Planの挙動（1クリック=1POST・/api/writerの返却shape）は維持
//
// このファイルは /writer のUI・生成ハンドラ・コピー共有機能・演出をすべて内包する。
// page.tsx 側はこのコンポーネントをラップして返すだけにすること。
// 使用環境：Next.js(App Router) / React Client Component / TypeScript / Framer Motion / shadcn-ui / PowerShell開発

"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  motion,
  AnimatePresence,
  useScroll,
  useTransform,
  MotionValue,
  useReducedMotion,
} from "framer-motion";
import clsx from "clsx";

import { Button, MotionButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import {
  Copy,
  Share2,
  Loader2,
  Sparkles,
  Zap,
  Star,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

/* =========================
   Durations（演出時間）
========================= */
const DUR = {
  TYPEWRITER_MS: 35,
  SPIN_MIN_MS: 700,
  DONE_BADGE_MS: 5000,
  CELEB_MS: 5200,
};

/* =========================
   Metrics / tokens
========================= */
const MIN_FEATURES = 8;

const TOKENS = {
  pageBg:
    "relative min-h-[calc(100dvh-160px)] isolate before:absolute before:inset-0 before:-z-20 before:bg-[linear-gradient(180deg,#F3F6FF_0%,#F9FBFF_50%,#FFFFFF_100%)]",
  brandDot:
    "inline-block size-2.5 rounded-sm bg-[linear-gradient(135deg,var(--brand-indigo,#2C5BEA),var(--brand-violet,#7C8BFF))] shadow-[0_0_0_1px_rgba(12,18,46,0.08)]",
};

/* =========================
   Schema for form
========================= */
const FormSchema = z.object({
  product: z.string().min(2, "商品名は2文字以上で入力してください"),
  purpose: z
    .string()
    .min(4, "用途/目的は4文字以上で入力してください")
    .max(120, "120文字以内で要約してください"),
  features: z
    .string()
    .min(
      MIN_FEATURES,
      `特徴・強みは${MIN_FEATURES}文字以上で入力してください`
    ),
  audience: z.string().min(2, "ターゲットは2文字以上で入力してください"),
  tone: z
    .enum(["friendly", "professional", "casual", "energetic"])
    .default("friendly"),
  template: z
    .enum(["lp", "email", "sns_short", "headline_only"])
    .default("lp"),
  length: z.enum(["short", "medium", "long"]).default("medium"),
  cta: z.boolean().default(true),
});
type FormValues = z.infer<typeof FormSchema>;

/* =========================
   API helpers
========================= */
async function callWriterAPI(payload: {
  meta: Record<string, any>;
  prompt: string;
}) {
  const res = await fetch("/api/writer", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

async function createShare(params: { title: string; body: string }) {
  const headers: HeadersInit = { "content-type": "application/json" };
  const devUser = process.env.NEXT_PUBLIC_DEV_USER_ID;
  if (devUser) headers["X-User-Id"] = devUser;
  return fetch("/api/shares", {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: params.title,
      body: params.body,
      isPublic: false,
    }),
  });
}

/* =========================
   Typewriter effect (出力表示用)
========================= */
function useTypewriter(fullText: string, speed = DUR.TYPEWRITER_MS) {
  const [shown, setShown] = useState("");
  const prev = useRef<string>("");

  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (fullText === prev.current) return;
    prev.current = fullText;
    setShown("");
    if (!fullText) return;

    let i = 0;
    let stop = false;
    const tick = () => {
      if (stop) return;
      i = Math.min(i + 1, fullText.length);
      setShown(fullText.slice(0, i));
      if (i < fullText.length) {
        timer.current = window.setTimeout(tick, speed);
      }
    };
    timer.current = window.setTimeout(tick, speed);

    return () => {
      stop = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [fullText, speed]);

  return shown || fullText;
}

/* =========================
   Markdown → HTML 簡易変換
   - スマホ段落崩れ対策
   - h2/h3, 箇条書き(- ), 段落を<p>に包む
   - 最低限の整形なので高度なMarkdownは対象外でOK
========================= */
function basicMarkdownToHtml(src: string): string {
  if (!src) return "";

  const lines = src.replace(/\r\n/g, "\n").split("\n");

  const htmlLines: string[] = [];
  let listBuffer: string[] = [];

  function flushList() {
    if (listBuffer.length > 0) {
      htmlLines.push(
        "<ul>" +
          listBuffer
            .map((item) => `<li>${item}</li>`)
            .join("") +
          "</ul>"
      );
      listBuffer = [];
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // ### ... → <h3>
    if (line.startsWith("### ")) {
      flushList();
      const text = line.replace(/^###\s+/, "");
      htmlLines.push(`<h3>${escapeHtml(text)}</h3>`);
      continue;
    }
    // ## ... → <h2>
    if (line.startsWith("## ")) {
      flushList();
      const text = line.replace(/^##\s+/, "");
      htmlLines.push(`<h2>${escapeHtml(text)}</h2>`);
      continue;
    }

    // - ... → <ul><li>...</li></ul>
    if (line.startsWith("- ")) {
      const itemText = line.replace(/^-+\s*/, "");
      listBuffer.push(escapeHtml(itemText));
      continue;
    }

    // 空行 → <br/>
    if (line === "") {
      flushList();
      htmlLines.push("<br/>");
      continue;
    }

    // 通常段落
    flushList();
    htmlLines.push(`<p>${escapeHtml(line)}</p>`);
  }

  flushList();

  // 連続 <br/> を整える（<br/><br/> → <br/>）
  const merged = htmlLines.join("\n").replace(/(<br\/>\s*){2,}/g, "<br/>");

  return merged;
}

// シンプルなHTMLエスケープ
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/* =========================
   Hero small badges row
========================= */
function BadgeRow() {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-600">
      <span className="inline-flex items-center gap-1 rounded-full border px-2 py-1 bg-white/70">
        <Star className="size-3 text-yellow-500" />
        CSAT 4.8 / 5.0
      </span>
      <span className="inline-flex items-center gap-1 rounded-full border px-2 py-1 bg-white/70">
        <Sparkles className="size-3 text-indigo-500" />
        3分で構成→出力→共有
      </span>
      <span className="inline-flex items-center gap-1 rounded-full border px-2 py-1 bg-white/70">
        <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
        テンプレ最適化済み
      </span>
    </div>
  );
}

/* =========================
   Main Component
========================= */
export default function ClientPage() {
  // 出力状態
  const [result, setResult] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [shareId, setShareId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // 完成演出用フラグ
  const [justCompleted, setJustCompleted] = useState(false);
  const [showDoneBadge, setShowDoneBadge] = useState(false);

  // タイマー参照
  const celebTimerRef = useRef<number | null>(null);
  const badgeTimerRef = useRef<number | null>(null);

  // 出力カードへのスクロール用
  const resultRef = useRef<HTMLDivElement | null>(null);

  // React Hook Form 設定
  const {
    register,
    handleSubmit,
    formState: { errors, isValid, isSubmitting },
    watch,
    reset,
    control,
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    mode: "onChange",
    defaultValues: {
      product: "",
      purpose: "",
      features: "",
      audience: "",
      tone: "friendly",
      template: "lp",
      length: "medium",
      cta: true,
    },
  });

  // 入力中の補助状態
  const product = watch("product");
  const featuresLen = [...(watch("features") ?? "")].length;

  /* =========================
     reduce motion / initial anim flags
  ========================= */
  const prefersReduce = useReducedMotion();
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => setHasMounted(true), []);
  const disableInitialAnim = prefersReduce || !hasMounted;

  /* =========================
     出力カードへスクロール
  ========================= */
  const scrollToResultSmart = useCallback(() => {
    const el = resultRef.current;
    if (!el) return;
    const run = () => {
      const OFFSET = 120; // navbarぶん
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const visibleEnough =
        rect.top >= 64 && rect.bottom <= vh - 96;
      if (visibleEnough) return;
      window.scrollTo({
        top: Math.max(0, rect.top + window.scrollY - OFFSET),
        behavior: prefersReduce ? "auto" : "smooth",
      });
    };
    requestAnimationFrame(() => requestAnimationFrame(run));
  }, [prefersReduce]);

  /* =========================
     フォーム送信(onSubmit)
  ========================= */
  const onSubmit = useCallback(
    async (vals: FormValues) => {
      setError(null);
      setShareId(null);
      setIsLoading(true);
      setResult("");
      setJustCompleted(false);
      setShowDoneBadge(false);

      // 古いタイマーをクリア
      if (celebTimerRef.current) {
        clearTimeout(celebTimerRef.current);
        celebTimerRef.current = null;
      }
      if (badgeTimerRef.current) {
        clearTimeout(badgeTimerRef.current);
        badgeTimerRef.current = null;
      }

      // 最新valsからpromptを構築
      const sections: string[] = [
        `# プロダクト: ${vals.product}`,
        `# 用途: ${vals.purpose}`,
        `# 特徴: ${vals.features}`,
        `# ターゲット: ${vals.audience}`,
        `# トーン: ${vals.tone}`,
        `# テンプレ: ${vals.template} / 長さ: ${vals.length} / CTA: ${vals.cta ? "あり" : "なし"}`,
        "",
        "## 出力要件",
        "- 日本語",
        "- 具体的・簡潔・販売導線を意識",
      ];

      if (vals.template === "lp") {
        sections.push("- 見出し→特長→CTA の順でセクション化");
      }
      if (vals.template === "email") {
        sections.push("- 件名→本文（導入/要点/CTA）");
      }
      if (vals.template === "sns_short") {
        sections.push("- 140字以内を目安、ハッシュタグ2つまで");
      }
      if (vals.template === "headline_only") {
        sections.push("- ヘッドライン案を3つ");
      }

      const prompt = sections.join("\n");

      // モデル呼び出しペイロード
      const payload = {
        meta: {
          template: vals.template,
          tone: vals.tone,
          length: vals.length,
          cta: vals.cta,
        },
        prompt,
      };

      // スピナー最低保証
      const minSpin = new Promise((r) =>
        setTimeout(r, DUR.SPIN_MIN_MS)
      );

      try {
        const j = await callWriterAPI(payload);

        // サーバ側は { ok, data, output } のどれかに本文を入れて返す
        const text =
          (j?.data?.text as string) ??
          (j?.output as string) ??
          (typeof j === "string" ? j : "");

        if (!text) {
          throw new Error(
            j?.message || "生成結果が空でした。"
          );
        }

        await minSpin;

        setResult(text);
        setJustCompleted(true);
        setShowDoneBadge(true);

        scrollToResultSmart();

        celebTimerRef.current = window.setTimeout(() => {
          setJustCompleted(false);
          celebTimerRef.current = null;
        }, DUR.CELEB_MS);

        badgeTimerRef.current = window.setTimeout(() => {
          setShowDoneBadge(false);
          badgeTimerRef.current = null;
        }, DUR.DONE_BADGE_MS);
      } catch (e: any) {
        await minSpin;
        const msg = e?.message ?? "生成に失敗しました。";
        setError(msg);
        toast.error("生成できませんでした", {
          description: msg,
        });
      } finally {
        setIsLoading(false);
      }
    },
    [scrollToResultSmart]
  );

  /* =========================
     アンマウント時のクリーンアップ
  ========================= */
  useEffect(() => {
    return () => {
      if (celebTimerRef.current)
        clearTimeout(celebTimerRef.current);
      if (badgeTimerRef.current)
        clearTimeout(badgeTimerRef.current);
    };
  }, []);

  /* =========================
     Ctrl/⌘ + Enter ハンドラ（グローバル）
     - 二重送信防止 (isLoading / isSubmitting / !isValid)
  ========================= */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // IME変換中は発火しない
      // @ts-ignore
      if ((e as any).isComposing) return;

      const isMac = navigator.platform.toLowerCase().includes("mac");
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!(mod && e.key === "Enter")) return;

      if (isLoading || isSubmitting || !isValid) return;

      e.preventDefault();
      void handleSubmit(onSubmit)();
    };

    document.addEventListener("keydown", handler, { passive: false });
    return () => {
      document.removeEventListener("keydown", handler);
    };
  }, [handleSubmit, onSubmit, isLoading, isSubmitting, isValid]);

  /* =========================
     クリップボードコピー
  ========================= */
  const doCopy = useCallback(async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      toast.success("コピーしました", {
        description: "内容をクリップボードに保存しました。",
      });
    } catch {
        setCopied(true);
        toast.error("コピーできませんでした", {
          description: "もう一度お試しください。",
        });
    } finally {
      setTimeout(() => setCopied(false), 1500);
    }
  }, [result]);

  /* =========================
     共有カード作成
  ========================= */
  const doShare = useCallback(async () => {
    setError(null);
    setShareId(null);
    try {
      if (!result)
        throw new Error(
          "共有する本文がありません。先に生成してください。"
        );
      const res = await createShare({
        title: product
          ? `${product} / Writer出力`
          : "Writer出力",
        body: result,
      });

      if (res.status === 201) {
        const created = await res.json();
        const id =
          created.id ||
          created?.data?.id ||
          null;
        setShareId(id);

        toast.success("共有が完了しました", {
          description: "共有カードを作成しました。",
          action: id
            ? {
                label: "開く",
                onClick: () => {
                  try {
                    window.open(
                      `/share/${id}`,
                      "_blank",
                      "noopener,noreferrer"
                    );
                  } catch {}
                },
              }
            : undefined,
        });
      } else {
        const j = await res.json().catch(() => ({}));
        const msg =
          j?.message ||
          j?.error ||
          `共有に失敗しました（${res.status}）`;
        throw new Error(msg);
      }
    } catch (e: any) {
      const msg =
        e?.message ?? "共有に失敗しました。";
      setError(msg);
      toast.error("共有できませんでした", {
        description: msg,
      });
    }
  }, [product, result]);

  /* =========================
     背景のオーブ / スクロールに応じたモーション
  ========================= */
  const { scrollYProgress } = useScroll();
  const orbUp = useTransform(scrollYProgress, [0, 1], [0, -80]);
  const orbDown = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const fadeBg = useTransform(scrollYProgress, [0, 0.3], [1, 0.8]);

  /* =========================
     出力がSTUBかどうか
  ========================= */
  const isStub = result.includes("【STUB出力】");

  /* =========================
     ボタン活性
  ========================= */
  const submitDisabled = !isValid || isLoading || isSubmitting;
  const submitReason = !isValid
    ? "必須項目の入力条件を満たしていません（それぞれのエラーメッセージを確認）"
    : isLoading || isSubmitting
    ? "実行中です"
    : "";

  /* =========================
     タイプライタ風エフェクト → Markdown整形
  ========================= */
  const typed = useTypewriter(result, DUR.TYPEWRITER_MS);
  const renderedHtml = basicMarkdownToHtml(typed);

  /* =========================
     JSX
  ========================= */
  return (
    <div className={TOKENS.pageBg}>
      {/* ブランド系CSS変数を全体に宣言 */}
      <style jsx global>{`
        :root {
          --brand-navy: #0B3BA7;
          --brand-indigo: #1A56DB;
          --brand-violet: #6A88FF;
        }
        @media (prefers-color-scheme: dark) {
          :root {
            --brand-navy: #0a2f8e;
            --brand-indigo: #1a4fcc;
            --brand-violet: #6a7fff;
          }
        }
      `}</style>

      {/* 背景のにじみオーブ（PC時は控えめのopacity） */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -z-10 -top-24 -left-20 h-60 w-60 rounded-full bg-indigo-400/25 blur-3xl md:opacity-70"
        style={{
          y: orbUp,
          opacity: fadeBg as MotionValue<number>,
        }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -z-10 -bottom-28 -right-24 h-80 w-80 rounded-full bg-violet-400/25 blur-3xl md:opacity-70"
        style={{
          y: orbDown,
          opacity: fadeBg as MotionValue<number>,
        }}
      />

      {/* ヒーローセクション（ガラスカード化＋中央寄せ） */}
      <div className="mx-auto max-w-7xl px-8 md:px-12 pt-8 md:pt-16 pb-6 md:pb-8">
        <motion.div
          initial={disableInitialAnim ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.45,
            ease: "easeOut",
          }}
        >
          {/* 半透明カードラッパ */}
          <div className="relative mx-auto w-full max-w-xl rounded-2xl border border-white/40 bg-white/60 px-5 py-6 shadow-[0_30px_120px_rgba(16,24,64,0.12)] ring-1 ring-black/5 backdrop-blur-md md:px-8 md:py-8">
            {/* コピー&説明 */}
            <h1 className="text-[28px] leading-[1.15] font-bold tracking-tight text-neutral-900 md:text-[40px] md:leading-[1.25] text-center">
              <span className="block">
                あなたの言葉を、
              </span>
              <span className="block bg-gradient-to-r from-indigo-600 to-violet-500 bg-clip-text text-transparent">
                AIで磨く。
              </span>
            </h1>

            <p className="mt-3 text-sm leading-relaxed text-neutral-700 md:text-base md:leading-relaxed md:max-w-prose text-center">
              伝えたいことは、もうできている。あとは整えるだけ。
              目的・強み・話し方を入力すると、そのまま使える紹介文やLP用コピーを仕上げます。
            </p>

            <div className="mt-5 flex justify-center">
              <BadgeRow />
            </div>

            {/* βテスト中メッセージ：カード下部で控えめに */}
            <div className="mt-4 text-center text-[11px] text-neutral-500">
              βテスト中：フィードバック歓迎
            </div>

            {/* カード外周の柔らかいリング(視覚的な持ち上がり感) */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-indigo-500/10 [mask-image:radial-gradient(60%_50%_at_50%_50%,black,transparent)]"
            />
          </div>
        </motion.div>
      </div>

      {/* ステップナビ（Hero外に独立配置） */}
      <div className="mx-auto max-w-7xl px-8 md:px-12 mt-2 md:mt-4">
        <div className="flex flex-wrap items-center justify-center gap-2 text-[12px] text-neutral-600 max-w-xl mx-auto text-center">
          <span className="inline-flex items-center gap-1 rounded-full border px-2 py-1 bg-white/70">
            <span className="inline-flex size-4 items-center justify-center rounded-full bg-indigo-600/15 text-indigo-700 text-[10px] font-semibold">
              1
            </span>
            入力
          </span>

          <span
            className={clsx(
              "inline-flex items-center gap-1 rounded-full border px-2 py-1",
              isLoading ? "bg-indigo-50 text-indigo-700" : "bg-white/70"
            )}
          >
            <span className="inline-flex size-4 items-center justify-center rounded-full bg-indigo-600/15 text-indigo-700 text-[10px] font-semibold">
              2
            </span>
            {isLoading ? "生成しています…" : "生成"}
          </span>

          <span className="inline-flex items-center gap-1 rounded-full border px-2 py-1 bg-white/70">
            <span className="inline-flex size-4 items-center justify-center rounded-full bg-indigo-600/15 text-indigo-700 text-[10px] font-semibold">
              3
            </span>
            出力
          </span>

          <AnimatePresence>
            {showDoneBadge && (
              <motion.span
                key="done"
                className="inline-flex items-center gap-1 rounded-full border px-2 py-1 bg-emerald-50 text-emerald-700"
                initial={{
                  opacity: 0,
                  y: -4,
                }}
                animate={{
                  opacity: 1,
                  y: 0,
                }}
                exit={{
                  opacity: 0,
                  y: -4,
                }}
                transition={{ duration: 0.2 }}
              >
                <CheckCircle2 className="size-3" />
                完了しました
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* 2カラム（左：フォーム / 右：出力） */}
      <div className="mx-auto max-w-7xl px-8 md:px-12 py-6 grid grid-cols-1 lg:grid-cols-[1.1fr,0.9fr] gap-8">
        {/* 左カラム: 入力フォーム */}
        <motion.section
          initial={disableInitialAnim ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <Card className="p-5 md:p-6">
            {/* 見出し行 */}
            <div className="flex items-center justify-between mb-3">
              <div className="inline-flex items-center gap-2">
                <span className="inline-flex size-6 items-center justify-center rounded-full bg-indigo-600/15 text-indigo-700 text-xs font-semibold">
                  1
                </span>
                <h2 className="text-sm font-semibold">
                  入力（最短指定）
                </h2>
              </div>
              <div className="text-xs text-neutral-500 hidden sm:block">
                Ctrl/⌘ + Enter で生成
              </div>
            </div>

            {/* フォーム本体 */}
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void handleSubmit(onSubmit)();
              }}
            >
              {/* 商品名 */}
              <div>
                <Label className="text-sm text-neutral-700 dark:text-neutral-300">
                  商品名
                </Label>
                <Input
                  placeholder="例）アイン薬局（全国の調剤薬局チェーン）"
                  aria-invalid={!!errors.product}
                  className={clsx(
                    errors.product &&
                      "border-red-300 focus-visible:ring-red-400"
                  )}
                  {...register("product")}
                />
                {errors.product && (
                  <p className="text-xs text-red-500">
                    {errors.product.message}
                  </p>
                )}
              </div>

              {/* 用途・目的 */}
              <div>
                <Label className="text-sm text-neutral-700 dark:text-neutral-300">
                  用途・目的
                </Label>
                <Input
                  placeholder="例）ホームページ用の紹介文を作りたい"
                  aria-invalid={!!errors.purpose}
                  className={clsx(
                    errors.purpose &&
                      "border-red-300 focus-visible:ring-red-400"
                  )}
                  {...register("purpose")}
                />
                {errors.purpose && (
                  <p className="text-xs text-red-500">
                    {errors.purpose.message}
                  </p>
                )}
              </div>

              {/* 特徴・強み */}
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm text-neutral-700 dark:text-neutral-300">
                    特徴・強み
                  </Label>
                  <span className="text-[11px] text-neutral-500">
                    {featuresLen} / {MIN_FEATURES}
                  </span>
                </div>
                <Textarea
                  rows={4}
                  placeholder="例）全国展開の調剤薬局。薬剤師が常駐し、処方箋に合わせた丁寧な服薬サポート。待ち時間の短縮、OTC医薬品の相談対応 など。"
                  aria-invalid={!!errors.features}
                  className={clsx(
                    errors.features &&
                      "border-red-300 focus-visible:ring-red-400"
                  )}
                  {...register("features")}
                />
                {errors.features ? (
                  <p className="text-xs text-red-500">
                    {errors.features.message}
                  </p>
                ) : (
                  <p className="text-xs text-neutral-500">
                    ※ {MIN_FEATURES}文字以上で入力してください
                  </p>
                )}
              </div>

              {/* ターゲット / トーン */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm text-neutral-700 dark:text-neutral-300">
                    ターゲット
                  </Label>
                  <Input
                    placeholder="例）地域の患者さん／ご家族／高齢の方"
                    aria-invalid={!!errors.audience}
                    {...register("audience")}
                  />
                  {errors.audience && (
                    <p className="text-xs text-red-500">
                      {errors.audience.message}
                    </p>
                  )}
                </div>
                <div>
                  <Label className="text-sm text-neutral-700 dark:text-neutral-300">
                    トーン
                  </Label>
                  <select
                    className="w-full border rounded-md h-9 px-2 bg-background"
                    {...register("tone")}
                  >
                    <option value="friendly">親しみやすい</option>
                    <option value="professional">落ち着いた/専門的</option>
                    <option value="casual">カジュアル</option>
                    <option value="energetic">エネルギッシュ</option>
                  </select>
                </div>
              </div>

              {/* テンプレ / 長さ / CTA */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-sm text-neutral-700 dark:text-neutral-300">
                    テンプレ
                  </Label>
                  <select
                    className="w-full border rounded-md h-9 px-2 bg-background"
                    {...register("template")}
                  >
                    <option value="lp">LP</option>
                    <option value="email">メール</option>
                    <option value="sns_short">SNSショート</option>
                    <option value="headline_only">ヘッドライン</option>
                  </select>
                </div>

                <div>
                  <Label className="text-sm text-neutral-700 dark:text-neutral-300">
                    長さ
                  </Label>
                  <select
                    className="w-full border rounded-md h-9 px-2 bg-background"
                    {...register("length")}
                  >
                    <option value="short">短め</option>
                    <option value="medium">普通</option>
                    <option value="long">長め</option>
                  </select>
                </div>

                <div className="flex items-center justify-between border rounded-md px-3">
                  <div>
                    <Label className="text-sm text-neutral-700 dark:text-neutral-300">
                      CTAを入れる
                    </Label>
                    <p className="text-xs text-neutral-500">
                      購入/申込の導線を明示
                    </p>
                  </div>

                  <Controller
                    name="cta"
                    control={control}
                    render={({ field }) => (
                      <Switch
                        checked={!!field.value}
                        onCheckedChange={field.onChange}
                        aria-label="CTAを入れる"
                      />
                    )}
                  />
                </div>
              </div>

              {/* アクションボタン行 */}
              <div className="pt-2 flex items-center gap-2 flex-wrap">
                {/* 生成ボタン */}
                <MotionButton
                  type="submit"
                  variant="primary"
                  className="shadow-soft-md"
                  disabled={submitDisabled}
                  data-action="generate"
                >
                  <span className="inline-flex items-center gap-2">
                    {isLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Zap className="size-4" />
                    )}
                    {isLoading ? "生成しています…" : "生成する"}
                  </span>
                </MotionButton>

                {/* リセット */}
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    reset({
                      product: "",
                      purpose: "",
                      features: "",
                      audience: "",
                      tone: "friendly",
                      template: "lp",
                      length: "medium",
                      cta: true,
                    })
                  }
                  disabled={isLoading}
                >
                  リセット
                </Button>

                {submitDisabled && (
                  <span className="text-xs text-neutral-500 max-w-[220px]">
                    {submitReason}
                  </span>
                )}
              </div>

              {/* サンプルリンク */}
              <div className="pt-2">
                <a
                  href="/share/guide"
                  className="text-xs text-indigo-700 hover:underline inline-flex items-center gap-1"
                >
                  <Sparkles className="size-3" />
                  生成サンプルを見る
                </a>
              </div>
            </form>
          </Card>
        </motion.section>

        {/* 右カラム: 出力プレビュー */}
        <motion.section
          ref={resultRef}
          initial={disableInitialAnim ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.35,
            delay: disableInitialAnim ? 0 : 0.05,
          }}
        >
          <Card
            className={clsx(
              "relative p-5 md:p-6 overflow-visible",
              justCompleted && "shadow-soft-md ring-2 ring-indigo-300/60"
            )}
          >
            {/* 出力カードヘッダ */}
            <div className="mb-3 flex items-center justify-between flex-wrap gap-3">
              <div className="inline-flex items-center gap-2">
                <span className="inline-flex size-6 items-center justify-center rounded-full bg-indigo-600/15 text-indigo-700 text-xs font-semibold">
                  3
                </span>
                <h2 className="text-sm font-semibold">
                  出力
                </h2>
              </div>

              <div className="flex gap-2 flex-wrap">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-2"
                  onClick={doCopy}
                  disabled={!result || isLoading}
                >
                  <Copy className="size-4" />
                  {copied ? "コピーしました" : "コピー"}
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="gap-2"
                  onClick={doShare}
                  disabled={!result || isLoading}
                >
                  <Share2 className="size-4" />
                  共有カードを作成
                </Button>
              </div>
            </div>

            {/* エラーメッセージ表示 */}
            {error && (
              <p className="text-xs text-red-600 mb-2">
                {error}
              </p>
            )}

            {/* Stubモード表示(テスト向け) */}
            {isStub && (
              <p className="text-xs text-neutral-500 mb-2">
                STUBモード：外部APIを呼び出さず固定ロジックで応答しています。
              </p>
            )}

            {/* 本文 */}
            <div className="prose prose-sm dark:prose-invert max-w-none leading-relaxed">
              {isLoading ? (
                // ローディングスケルトン
                <div
                  className="animate-pulse space-y-2"
                  aria-live="polite"
                  aria-busy="true"
                >
                  <div className="h-4 w-3/5 bg-neutral-200 rounded" />
                  <div className="h-4 w-4/5 bg-neutral-200 rounded" />
                  <div className="h-4 w-2/3 bg-neutral-200 rounded" />
                  <div className="h-4 w-5/6 bg-neutral-200 rounded" />
                </div>
              ) : result ? (
                // 生成済み本文（Markdown→HTML整形済みを挿入）
                <motion.div
                  key={result.slice(0, 24)}
                  initial={{
                    opacity: 0,
                    y: 6,
                    filter: "blur(2px)",
                  }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    filter: "blur(0px)",
                  }}
                  transition={{ duration: 0.35 }}
                >
                  <div
                    className="whitespace-normal break-words"
                    // eslint-disable-next-line react/no-danger
                    dangerouslySetInnerHTML={{
                      __html: renderedHtml,
                    }}
                  />
                </motion.div>
              ) : (
                // まだ出力なし
                <p className="text-neutral-500">
                  生成結果がここに表示されます。
                </p>
              )}
            </div>

            {/* 別案生成ボタン */}
            <div className="mt-4">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void handleSubmit(onSubmit)()}
                disabled={isLoading}
                className="gap-2"
                title="現在の入力・トーンを使って別案を生成します"
              >
                <Sparkles className="size-4" />
                同じトーンで別の案を作成
              </Button>
            </div>

            {/* 祝エフェクト（完了時のみ） */}
            <AnimatePresence initial={false}>
              {justCompleted && !isLoading && !error && (
                <div className="pointer-events-none absolute inset-0 z-50 overflow-visible">
                  {Array.from({ length: 12 }).map((_, i) => {
                    const r = (i * 37) % 100;
                    const c = (i * 61) % 100;
                    const top = `${10 + (r % 80)}%`;
                    const left = `${5 + (c % 90)}%`;
                    const delay = (i % 6) * 0.08;

                    return (
                      <motion.span
                        key={i}
                        className="absolute text-base select-none"
                        style={{
                          top,
                          left,
                        }}
                        initial={{
                          opacity: 0,
                          y: 0,
                          scale: 0.6,
                          rotate: 0,
                        }}
                        animate={{
                          opacity: [0, 1, 0],
                          y: -18,
                          scale: 1.1,
                          rotate: 20,
                        }}
                        exit={{
                          opacity: 0,
                        }}
                        transition={{
                          duration: 1.2,
                          delay,
                          ease: "easeOut",
                        }}
                        aria-hidden="true"
                      >
                        ✨
                      </motion.span>
                    );
                  })}

                  <motion.div
                    role="status"
                    aria-live="polite"
                    className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2"
                    initial={{
                      opacity: 0,
                      y: -10,
                      scale: 0.95,
                    }}
                    animate={{
                      opacity: 1,
                      y: 0,
                      scale: 1,
                    }}
                    exit={{
                      opacity: 0,
                      y: -10,
                      scale: 0.98,
                    }}
                    transition={{
                      duration: 0.4,
                    }}
                  >
                    <div className="rounded-full bg-white/90 shadow-md border px-4 py-1.5 text-xs font-medium text-gray-800 backdrop-blur">
                      素敵な仕上がりです ✨
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>

            {/* カード外周の柔らかいリング */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-inset ring-indigo-500/10 [mask-image:radial-gradient(60%_50%_at_50%_50%,black,transparent)]"
            />
          </Card>
        </motion.section>
      </div>
    </div>
  );
}
