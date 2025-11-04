"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  motion,
  AnimatePresence,
  useScroll,
  useTransform,
  MotionValue,
} from "framer-motion";
import clsx from "clsx";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Copy, Share2, Loader2, Sparkles, Zap, Star, CheckCircle2 } from "lucide-react";

/* =========================
   時間トークン（演出コントロール）
   ========================= */
const DUR = {
  TYPEWRITER_MS: 35,  // 少しゆっくり
  SPIN_MIN_MS: 600,   // スケルトン最短
  DONE_BADGE_MS: 2500,
  FLASH_RING_MS: 1200,
};

/* =========================
   視覚トークン（Premium × Brand Deep）
   ========================= */
const BRAND = {
  navy: "#0B3BA7",
  indigo: "#1A56DB",
  violet: "#6A88FF",
};

const TOKENS = {
  pageBg:
    "relative min-h-[calc(100dvh-160px)] isolate " +
    "before:absolute before:inset-0 before:-z-20 before:bg-[linear-gradient(180deg,#F3F6FF_0%,#F9FBFF_50%,#FFFFFF_100%)]",

  glass:
    "rounded-3xl border border-white/70 dark:border-white/10 bg-white/70 dark:bg-neutral-900/60 backdrop-blur " +
    "shadow-[0_16px_48px_rgba(16,24,40,0.10)]",

  label: "text-sm text-neutral-700 dark:text-neutral-300",
  help: "text-xs text-neutral-500",

  outputWrap:
    "relative rounded-3xl border border-indigo-300/50 bg-white/75 backdrop-blur " +
    "shadow-[0_20px_60px_rgba(16,24,40,0.12)] ring-1 ring-indigo-500/10",

  brandDot:
    "inline-block size-2.5 rounded-sm bg-[linear-gradient(135deg,#2C5BEA,#7C8BFF)] shadow-[0_0_0_1px_rgba(12,18,46,0.08)]",
};

/* =========================
   型＆バリデーション
   ========================= */
const MIN_FEATURES = 8;
const FormSchema = z.object({
  product: z.string().min(2, "商品名は2文字以上で入力してください"),
  purpose: z
    .string()
    .min(4, "用途/目的は4文字以上で入力してください")
    .max(120, "120文字以内で要約してください"),
  features: z
    .string()
    .min(MIN_FEATURES, `特徴・強みは${MIN_FEATURES}文字以上で入力してください`),
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
   APIユーティリティ（既存踏襲）
   ========================= */
async function callWriterAPI(payload: { meta: Record<string, any>; prompt: string }) {
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
    body: JSON.stringify({ title: params.title, body: params.body, isPublic: false }),
  });
}

/* =========================
   タイプライター表示（非ブロッキング／アクセシブル）
   ========================= */
function useTypewriter(fullText: string, speed = DUR.TYPEWRITER_MS) {
  const [shown, setShown] = useState("");
  const prev = useRef<string>("");

  useEffect(() => {
    if (fullText !== prev.current) {
      prev.current = fullText;
      setShown("");
      if (!fullText) return;
      let i = 0;
      let cancelled = false;
      const tick = () => {
        if (cancelled) return;
        i = Math.min(i + 1, fullText.length);
        setShown(fullText.slice(0, i));
        if (i < fullText.length) setTimeout(tick, speed);
      };
      setTimeout(tick, speed);
      return () => {
        cancelled = true;
      };
    }
  }, [fullText, speed]);

  return shown || fullText;
}

/* =========================
   小UI：実績バッジ・KPIピル
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
   ページ本体
   ========================= */
export default function WriterPage() {
  const [result, setResult] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [shareId, setShareId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false); // ③完了フラッシュ
  const [showDoneBadge, setShowDoneBadge] = useState(false); // ③「完了しました」

  const resultRef = useRef<HTMLDivElement | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isValid, isSubmitting },
    watch,
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    mode: "onChange",
    defaultValues: {
      product: "ShopWriter",
      purpose: "文章生成",
      features: "爆速で最適な文章",
      audience: "ユーザー",
      tone: "friendly",
      template: "lp",
      length: "medium",
      cta: true,
    },
  });

  const product = watch("product");
  const featuresLen = [...(watch("features") ?? "")].length;

  // Prompt（既存構造を保持）
  const prompt = useMemo(() => {
    const v = watch();
    const sections = [
      `# プロダクト: ${v.product}`,
      `# 用途: ${v.purpose}`,
      `# 特徴: ${v.features}`,
      `# ターゲット: ${v.audience}`,
      `# トーン: ${v.tone}`,
      `# テンプレ: ${v.template} / 長さ: ${v.length} / CTA: ${v.cta ? "あり" : "なし"}`,
      "",
      "## 出力要件",
      "- 日本語",
      "- 具体的・簡潔・販売導線を意識",
    ];
    if (v.template === "lp") sections.push("- 見出し→特長→CTA の順でセクション化");
    if (v.template === "email") sections.push("- 件名→本文（導入/要点/CTA）");
    if (v.template === "sns_short") sections.push("- 140字以内を目安、ハッシュタグ2つまで");
    if (v.template === "headline_only") sections.push("- ヘッドライン案を3つ");
    return sections.join("\n");
  }, [watch]);

  /* ----- 生成（Skeleton 最低600ms） ----- */
  const onSubmit = useCallback(
    async (vals: FormValues) => {
      setError(null);
      setShareId(null);
      setIsLoading(true);         // ②開始
      setResult("");
      setJustCompleted(false);
      setShowDoneBadge(false);
      const minSpin = new Promise((r) => setTimeout(r, DUR.SPIN_MIN_MS));
      try {
        const payload = {
          meta: { template: vals.template, tone: vals.tone, length: vals.length, cta: vals.cta },
          prompt,
        };
        const j = await callWriterAPI(payload);
        const text =
          (j?.data?.text as string) ??
          (j?.output as string) ??
          (typeof j === "string" ? j : "");
        if (!text) throw new Error(j?.message || "生成結果が空でした。");
        await minSpin;
        setResult(text);
        setJustCompleted(true);                  // ③フラッシュ（1.2s）
        setShowDoneBadge(true);                  // ③完了表示（2.5s）
        setTimeout(() => setJustCompleted(false), DUR.FLASH_RING_MS);
        setTimeout(() => setShowDoneBadge(false), DUR.DONE_BADGE_MS);
      } catch (e: any) {
        await minSpin;
        setError(e?.message ?? "生成に失敗しました。");
      } finally {
        setIsLoading(false);
      }
    },
    [prompt]
  );

  /* ----- Ctrl/⌘+Enter（バリデーション尊重） ----- */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // @ts-ignore
      if ((e as any).isComposing) return;
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.key === "Enter") {
        e.preventDefault();
        void handleSubmit(onSubmit)();
      }
    };
    document.addEventListener("keydown", handler, { passive: false });
    return () => document.removeEventListener("keydown", handler);
  }, [handleSubmit, onSubmit]);

  /* ----- 出力後スクロール ----- */
  useEffect(() => {
    if (!isLoading && result) {
      requestAnimationFrame(() => {
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [isLoading, result]);

  /* ----- コピー（1.5秒表示） ----- */
  const doCopy = useCallback(async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [result]);

  /* ----- 共有 ----- */
  const doShare = useCallback(async () => {
    setError(null);
    setShareId(null);
    try {
      if (!result) throw new Error("共有する本文がありません。先に生成してください。");
      const res = await createShare({
        title: product ? `${product} / Writer出力` : "Writer出力",
        body: result,
      });
      if (res.status === 201) {
        const created = await res.json();
        setShareId(created.id || created?.data?.id || null);
      } else {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.message || j?.error || `共有に失敗しました (${res.status})`);
      }
    } catch (e: any) {
      setError(e?.message ?? "共有に失敗しました。");
    }
  }, [product, result]);

  const submitDisabled = !isValid || isLoading || isSubmitting;
  const submitReason = !isValid
    ? "必須項目の入力条件を満たしていません（それぞれのエラーメッセージを確認）"
    : isLoading || isSubmitting
    ? "実行中です"
    : "";

  const isStub = result.includes("【STUB出力】");
  const typed = useTypewriter(result, DUR.TYPEWRITER_MS);

  /* ----- スクロール・パララックス（Hero背面のオーブ） ----- */
  const { scrollYProgress } = useScroll();
  const orbUp = useTransform(scrollYProgress, [0, 1], [0, -80]);
  const orbDown = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const fadeBg = useTransform(scrollYProgress, [0, 0.3], [1, 0.85]);

  /* =========================
     UI
     ========================= */
  return (
    <div className={TOKENS.pageBg}>
      {/* 背景のパララックス・オーブ */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -z-10 -top-24 -left-20 h-60 w-60 rounded-full bg-indigo-400/25 blur-3xl"
        style={{ y: orbUp, opacity: fadeBg as MotionValue<number> }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -z-10 -bottom-28 -right-24 h-80 w-80 rounded-full bg-violet-400/25 blur-3xl"
        style={{ y: orbDown, opacity: fadeBg as MotionValue<number> }}
      />

      {/* ===== Hero：キャッチ＋実績バッジ ===== */}
      <div className="mx-auto max-w-7xl px-8 md:px-12 pt-8 md:pt-10">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
        >
          <div className="flex items-start justify-between gap-6">
            <div>
              <h1 className="text-[28px] md:text-[32px] font-semibold tracking-tight text-neutral-900">
                <span className="inline-flex items-center gap-2">
                  <span className={TOKENS.brandDot} />
                  あなたの言葉を、<span className="bg-gradient-to-r from-indigo-600 to-violet-500 bg-clip-text text-transparent">伝わる言葉</span>に。
                </span>
              </h1>
              <p className="mt-2 text-sm text-neutral-600">
                最短3ステップで構成・話し方・トーンを指定。プレミアムな生成体験で、成果に直結する文章を。
              </p>
              <div className="mt-3">
                <BadgeRow />
              </div>
            </div>
            <div className="hidden md:block text-xs text-neutral-500 pt-1">
              βテスト中：フィードバック歓迎
            </div>
          </div>
        </motion.div>
      </div>

      {/* ===== Stepナビ（② 常駐＆状態切替） ===== */}
      <div className="mx-auto max-w-7xl px-8 md:px-12 mt-3">
        <div className="flex items-center gap-2 text-[12px] text-neutral-600">
          <span className="inline-flex items-center gap-1 rounded-full border px-2 py-1 bg-white/70">
            <span className="inline-flex size-4 items-center justify-center rounded-full bg-indigo-600/15 text-indigo-700 text-[10px] font-semibold">1</span>
            入力
          </span>

          {/* ← 常駐。isLoading で表記と色味だけ変える */}
          <span
            className={clsx(
              "inline-flex items-center gap-1 rounded-full border px-2 py-1",
              isLoading ? "bg-indigo-50 text-indigo-700" : "bg-white/70"
            )}
          >
            <span className="inline-flex size-4 items-center justify-center rounded-full bg-indigo-600/15 text-indigo-700 text-[10px] font-semibold">2</span>
            {isLoading ? "生成中…" : "生成"}
          </span>

          <span className="inline-flex items-center gap-1 rounded-full border px-2 py-1 bg-white/70">
            <span className="inline-flex size-4 items-center justify-center rounded-full bg-indigo-600/15 text-indigo-700 text-[10px] font-semibold">3</span>
            出力
          </span>

          <AnimatePresence>
            {showDoneBadge && (
              <motion.span
                key="done"
                className="inline-flex items-center gap-1 rounded-full border px-2 py-1 bg-emerald-50 text-emerald-700"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
              >
                <CheckCircle2 className="size-3" />
                完了しました
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ===== メイン：入力／出力 ===== */}
      <div className="mx-auto max-w-7xl px-8 md:px-12 py-6 grid grid-cols-1 lg:grid-cols-[1.1fr,0.9fr] gap-8">
        {/* 入力（Step1） */}
        <motion.section
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className={clsx(TOKENS.glass, "p-5 md:p-6")}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="inline-flex items-center gap-2">
              <span className="inline-flex size-6 items-center justify-center rounded-full bg-indigo-600/15 text-indigo-700 text-xs font-semibold">
                1
              </span>
              <h2 className="text-sm font-semibold">入力（最短指定）</h2>
            </div>
            <div className="text-xs text-neutral-500 hidden sm:block">
              Ctrl/⌘ + Enter で生成
            </div>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            <div>
              <Label className={TOKENS.label}>商品名</Label>
              <Input
                placeholder="例）ShopWriter（AIライティング支援）"
                aria-invalid={!!errors.product}
                className={clsx(
                  errors.product && "border-red-300 focus-visible:ring-red-400"
                )}
                {...register("product")}
              />
              {errors.product && (
                <p className="text-xs text-red-500">{errors.product.message}</p>
              )}
            </div>

            <div>
              <Label className={TOKENS.label}>用途・目的</Label>
              <Input
                placeholder="例）LP導入文を作る／告知文を作る など"
                aria-invalid={!!errors.purpose}
                className={clsx(
                  errors.purpose && "border-red-300 focus-visible:ring-red-400"
                )}
                {...register("purpose")}
              />
              {errors.purpose && (
                <p className="text-xs text-red-500">{errors.purpose.message}</p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label className={TOKENS.label}>特徴・強み</Label>
                <span className="text-[11px] text-neutral-500">
                  {featuresLen} / {MIN_FEATURES}
                </span>
              </div>
              <Textarea
                rows={4}
                placeholder="例）3分で構成〜出力〜共有まで完了。共有カード、差分比較に対応。"
                aria-invalid={!!errors.features}
                className={clsx(
                  errors.features && "border-red-300 focus-visible:ring-red-400"
                )}
                {...register("features")}
              />
              {errors.features ? (
                <p className="text-xs text-red-500">{errors.features.message}</p>
              ) : (
                <p className={TOKENS.help}>
                  ※ {MIN_FEATURES}文字以上で入力してください
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className={TOKENS.label}>ターゲット</Label>
                <Input
                  placeholder="例）個人事業主／EC担当／SaaS PMM"
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
                <Label className={TOKENS.label}>トーン</Label>
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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className={TOKENS.label}>テンプレ</Label>
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
                <Label className={TOKENS.label}>長さ</Label>
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
                  <Label className={TOKENS.label}>CTAを入れる</Label>
                  <p className={TOKENS.help}>購入/申込の導線を明示</p>
                </div>
                <Switch {...register("cta")} />
              </div>
            </div>

            {/* 生成ボタン（流れるグラデ＋粒子） */}
            <div className="pt-2 flex items-center gap-2">
              <motion.button
                type="submit"
                disabled={submitDisabled}
                className="group relative overflow-hidden rounded-xl px-4 py-2 text-white shadow-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-400"
                data-action="generate"
                style={{
                  backgroundImage: `linear-gradient(95deg, ${BRAND.navy} 0%, ${BRAND.indigo} 50%, ${BRAND.violet} 100%)`,
                  backgroundSize: "200% 100%",
                }}
                animate={{
                  backgroundPosition: isLoading ? ["0% 0%", "100% 0%"] : "0% 0%",
                }}
                transition={{
                  duration: 1.4,
                  repeat: isLoading ? Infinity : 0,
                  ease: "easeInOut",
                }}
                whileHover={{ scale: submitDisabled ? 1 : 1.01 }}
                whileTap={{ scale: submitDisabled ? 1 : 0.99 }}
              >
                <span className="relative inline-flex items-center gap-2">
                  {isLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Zap className="size-4" />
                  )}
                  生成する
                  <AnimatePresence>
                    {isLoading && (
                      <motion.span
                        className="absolute -inset-1 pointer-events-none"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.9 }}
                        exit={{ opacity: 0 }}
                      >
                        <motion.span
                          className="absolute left-0 top-1/2 -translate-y-1/2 h-[2px] w-8 bg-white/60 rounded-full"
                          initial={{ x: 0, opacity: 0.8 }}
                          animate={{ x: 56 }}
                          transition={{
                            repeat: Infinity,
                            duration: 1.2,
                            ease: "easeInOut",
                          }}
                        />
                        <motion.span
                          className="absolute left-2 top-1/2 -translate-y-1/2 h-[2px] w-5 bg-white/40 rounded-full"
                          initial={{ x: 0, opacity: 0.7 }}
                          animate={{ x: 48 }}
                          transition={{
                            repeat: Infinity,
                            duration: 1.0,
                            ease: "easeInOut",
                            delay: 0.15,
                          }}
                        />
                        <motion.span
                          className="absolute left-4 top-1/2 -translate-y-1/2 h-[2px] w-3 bg-white/30 rounded-full"
                          initial={{ x: 0, opacity: 0.6 }}
                          animate={{ x: 40 }}
                          transition={{
                            repeat: Infinity,
                            duration: 0.9,
                            ease: "easeInOut",
                            delay: 0.3,
                          }}
                        />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </span>
              </motion.button>

              <Button
                type="button"
                variant="secondary"
                onClick={() => reset()}
                disabled={isLoading}
              >
                リセット
              </Button>
              {submitDisabled && (
                <span className="text-xs text-neutral-500">{submitReason}</span>
              )}
            </div>

            {/* 小CTA：生成サンプルを見る */}
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
        </motion.section>

        {/* 出力（Step3） */}
        <motion.section
          ref={resultRef}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05 }}
          className={clsx(
            TOKENS.outputWrap,
            "p-5 md:p-6",
            justCompleted &&
              "ring-2 ring-indigo-300/60 shadow-[0_24px_72px_rgba(26,86,219,0.20)]"
          )}
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="inline-flex items-center gap-2">
              <span className="inline-flex size-6 items-center justify-center rounded-full bg-indigo-600/15 text-indigo-700 text-xs font-semibold">
                3
              </span>
              <h2 className="text-sm font-semibold">出力</h2>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-2"
                onClick={doCopy}
                disabled={!result || isLoading}
              >
                <Copy className="size-4" />
                {copied ? "コピー済み" : "コピー"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="gap-2"
                onClick={doShare}
                disabled={!result || isLoading}
                title={
                  process.env.NEXT_PUBLIC_DEV_USER_ID
                    ? ""
                    : "開発時は NEXT_PUBLIC_DEV_USER_ID を設定すると共有できます"
                }
              >
                <Share2 className="size-4" />
                共有カード
              </Button>
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 mb-2">{error}</p>
          )}

          {isStub && (
            <p className="text-xs text-neutral-500 mb-2">
              STUBモード：外部APIを呼び出さず固定ロジックで応答しています。
            </p>
          )}

          <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap leading-relaxed">
            {isLoading ? (
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
              <motion.div
                key={result.slice(0, 24)}
                initial={{ opacity: 0, y: 6, filter: "blur(2px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.35 }}
              >
                {typed}
              </motion.div>
            ) : (
              <p className="text-neutral-500">生成結果がここに表示されます。</p>
            )}
          </div>

          {shareId && (
            <p className="text-xs text-neutral-500 mt-3">
              共有を作成しました：
              <a className="underline" href={`/dashboard/share/${shareId}`}>
                ダッシュボードで見る
              </a>{" "}
              ／{" "}
              <a className="underline" href={`/share/${shareId}`} target="_blank">
                公開ページ
              </a>
            </p>
          )}

          {/* サブCTA：同じトーンで別案を生成する */}
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
              同じトーンで別案を生成する
            </Button>
          </div>

          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-inset ring-indigo-500/10 [mask-image:radial-gradient(60%_50%_at_50%_50%,black,transparent)]"
          />
        </motion.section>
      </div>
    </div>
  );
}


