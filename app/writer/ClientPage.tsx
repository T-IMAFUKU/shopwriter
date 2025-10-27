// app/writer/ClientPage.tsx
// ClientPage = /writer の唯一のインタラクティブ実装(SSOT)
// - "use client"（ブラウザ側）
// - 入力フォーム / 生成ハンドラ / トースト演出 / 共有カード作成 などすべてここで完結
// page.tsx 側はこのコンポーネントをラップして返すだけにすること
//
// 注意:
// - ここからビジネスロジックを page.tsx 側にコピーしないこと
// - runtime / dynamic の指定は page.tsx 側で行うこと
// - UIのステップ表示 (①入力 / ②生成 / ③出力 + 完了バッジ) は必ずここから描画すること
//
// このファイルは Precision Plan の「Writer UI」の単一情報源として扱う

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
   Durations（演出時間 少し長め）
   ========================= */
const DUR = {
  TYPEWRITER_MS: 35,
  SPIN_MIN_MS: 700,
  DONE_BADGE_MS: 5000,
  CELEB_MS: 5200,
};

/* =========================
   Tokens
   ========================= */
const MIN_FEATURES = 8;

const TOKENS = {
  pageBg:
    "relative min-h-[calc(100dvh-160px)] isolate before:absolute before:inset-0 before:-z-20 before:bg-[linear-gradient(180deg,#F3F6FF_0%,#F9FBFF_50%,#FFFFFF_100%)]",
  brandDot:
    "inline-block size-2.5 rounded-sm bg-[linear-gradient(135deg,var(--brand-indigo,#2C5BEA),var(--brand-violet,#7C8BFF))] shadow-[0_0_0_1px_rgba(12,18,46,0.08)]",
};

/* =========================
   Schema
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
   Typewriter effect
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
   Badges row (Hero下の指標表示)
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
  // 状態
  const [result, setResult] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [shareId, setShareId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [justCompleted, setJustCompleted] = useState(false);
  const [showDoneBadge, setShowDoneBadge] = useState(false);

  const celebTimerRef = useRef<number | null>(null);
  const badgeTimerRef = useRef<number | null>(null);

  // 出力カードへのスクロール用
  const resultRef = useRef<HTMLDivElement | null>(null);

  // React Hook Form
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

  // 派生状態
  const product = watch("product");
  const featuresLen = [...(watch("features") ?? "")].length;

  const prompt = useMemo(() => {
    const v = watch();
    const sections: string[] = [
      `# プロダクト: ${v.product}`,
      `# 用途: ${v.purpose}`,
      `# 特徴: ${v.features}`,
      `# ターゲット: ${v.audience}`,
      `# トーン: ${v.tone}`,
      `# テンプレ: ${v.template} / 長さ: ${v.length} / CTA: ${
        v.cta ? "あり" : "なし"
      }`,
      "",
      "## 出力要件",
      "- 日本語",
      "- 具体的・簡潔・販売導線を意識",
    ];
    if (v.template === "lp")
      sections.push("- 見出し→特長→CTA の順でセクション化");
    if (v.template === "email")
      sections.push("- 件名→本文（導入/要点/CTA）");
    if (v.template === "sns_short")
      sections.push("- 140字以内を目安、ハッシュタグ2つまで");
    if (v.template === "headline_only")
      sections.push("- ヘッドライン案を3つ");
    return sections.join("\n");
  }, [watch]);

  // アニメーションの簡略化フラグ
  const prefersReduce = useReducedMotion();
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => setHasMounted(true), []);
  const disableInitialAnim = prefersReduce || !hasMounted;

  // 出力カードへスクロール（生成完了時）
  const scrollToResultSmart = useCallback(() => {
    const el = resultRef.current;
    if (!el) return;
    const run = () => {
      const OFFSET = 120; // グローバルヘッダー分
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const ok = rect.top >= 64 && rect.bottom <= vh - 96;
      if (ok) return;
      window.scrollTo({
        top: Math.max(0, rect.top + window.scrollY - OFFSET),
        behavior: prefersReduce ? "auto" : "smooth",
      });
    };
    requestAnimationFrame(() => requestAnimationFrame(run));
  }, [prefersReduce]);

  // 送信（生成リクエスト）
  const onSubmit = useCallback(
    async (vals: FormValues) => {
      setError(null);
      setShareId(null);
      setIsLoading(true);
      setResult("");
      setJustCompleted(false);
      setShowDoneBadge(false);

      // 既存タイマーのクリア
      if (celebTimerRef.current) {
        clearTimeout(celebTimerRef.current);
        celebTimerRef.current = null;
      }
      if (badgeTimerRef.current) {
        clearTimeout(badgeTimerRef.current);
        badgeTimerRef.current = null;
      }

      // 最低スピン時間を確保（UIの"生成中"演出を見せる）
      const minSpin = new Promise((r) => setTimeout(r, DUR.SPIN_MIN_MS));

      try {
        const payload = {
          meta: {
            template: vals.template,
            tone: vals.tone,
            length: vals.length,
            cta: vals.cta,
          },
          prompt,
        };
        const j = await callWriterAPI(payload);

        const text =
          (j?.data?.text as string) ??
          (j?.output as string) ??
          (typeof j === "string" ? j : "");
        if (!text) throw new Error(j?.message || "生成結果が空でした。");

        // UI演出の最低時間を待つ
        await minSpin;

        // 結果セット＆祝演出ON
        setResult(text);
        setJustCompleted(true);
        setShowDoneBadge(true);

        // 出力枠までスクロール
        scrollToResultSmart();

        // 祝演出の寿命タイマー
        celebTimerRef.current = window.setTimeout(() => {
          setJustCompleted(false);
          celebTimerRef.current = null;
        }, DUR.CELEB_MS);

        // 完了バッジの寿命タイマー
        badgeTimerRef.current = window.setTimeout(() => {
          setShowDoneBadge(false);
          badgeTimerRef.current = null;
        }, DUR.DONE_BADGE_MS);
      } catch (e: any) {
        await minSpin;
        const msg = e?.message ?? "生成に失敗しました。";
        setError(msg);
        toast.error("生成できませんでした", { description: msg });
      } finally {
        setIsLoading(false);
      }
    },
    [prompt, scrollToResultSmart]
  );

  // アンマウント時にタイマー破棄
  useEffect(() => {
    return () => {
      if (celebTimerRef.current) clearTimeout(celebTimerRef.current);
      if (badgeTimerRef.current) clearTimeout(badgeTimerRef.current);
    };
  }, []);

  // Ctrl/⌘ + Enter ショートカット
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // IME変換中は発火しない
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

  // コピー機能
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

  // 共有カード作成
  const doShare = useCallback(async () => {
    setError(null);
    setShareId(null);
    try {
      if (!result)
        throw new Error(
          "共有する本文がありません。先に生成してください。"
        );
      const res = await createShare({
        title: product ? `${product} / Writer出力` : "Writer出力",
        body: result,
      });

      if (res.status === 201) {
        const created = await res.json();
        const id = created.id || created?.data?.id || null;
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
      const msg = e?.message ?? "共有に失敗しました。";
      setError(msg);
      toast.error("共有できませんでした", { description: msg });
    }
  }, [product, result]);

  // 背景オーブのパララックス
  const { scrollYProgress } = useScroll();
  const orbUp = useTransform(scrollYProgress, [0, 1], [0, -80]);
  const orbDown = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const fadeBg = useTransform(scrollYProgress, [0, 0.3], [1, 0.85]);

  // 出力がStubかどうか
  const isStub = result.includes("【STUB出力】");

  // ボタン活性制御
  const submitDisabled = !isValid || isLoading || isSubmitting;
  const submitReason = !isValid
    ? "必須項目の入力条件を満たしていません（それぞれのエラーメッセージを確認）"
    : isLoading || isSubmitting
    ? "実行中です"
    : "";

  // タイプライタ表示
  const typed = useTypewriter(result, DUR.TYPEWRITER_MS);

  return (
    <div className={TOKENS.pageBg}>
      {/* グローバルブランド変数（ブランドネイビー等） */}
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

      {/* ===== 背景オーブ（視覚効果） ===== */}
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

      {/* ===== Heroセクション ===== */}
      <div className="mx-auto max-w-7xl px-8 md:px-12 pt-8 md:pt-10">
        <motion.div
          initial={disableInitialAnim ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
        >
          <div className="flex items-start justify-between gap-6">
            <div>
              <h1 className="text-[28px] md:text-[32px] font-semibold tracking-tight text-neutral-900">
                <span className="inline-flex items-center gap-2">
                  <span className={TOKENS.brandDot} />
                  あなたの言葉を、
                  <span className="bg-gradient-to-r from-indigo-600 to-violet-500 bg-clip-text text-transparent">
                    伝わる言葉
                  </span>
                  に。
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

      {/* ===== ステップナビ (②生成は常駐 / 実行中は文言変更) ===== */}
      <div className="mx-auto max-w-7xl px-8 md:px-12 mt-3">
        <div className="flex items-center gap-2 text-[12px] text-neutral-600">
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

      {/* ===== 入力フォーム / 出力プレビュー領域 ===== */}
      <div className="mx-auto max-w-7xl px-8 md:px-12 py-6 grid grid-cols-1 lg:grid-cols-[1.1fr,0.9fr] gap-8">
        {/* 左カラム: 入力 */}
        <motion.section
          initial={disableInitialAnim ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <Card className="p-5 md:p-6">
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

            <form
              className="space-y-4"
              onSubmit={handleSubmit(onSubmit)}
              onKeyDown={(e) => {
                const isMac = navigator.platform.toLowerCase().includes("mac");
                const mod = isMac ? e.metaKey : e.ctrlKey;
                if (mod && e.key === "Enter") {
                  e.preventDefault();
                  void handleSubmit(onSubmit)();
                }
              }}
            >
              <div>
                <Label className="text-sm text-neutral-700 dark:text-neutral-300">
                  商品名
                </Label>
                <Input
                  placeholder="例）ShopWriter（AIライティング支援）"
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

              <div>
                <Label className="text-sm text-neutral-700 dark:text-neutral-300">
                  用途・目的
                </Label>
                <Input
                  placeholder="例）LP導入文を作る／告知文を作る など"
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
                  placeholder="例）3分で構成〜出力〜共有まで完了。共有カード、差分比較に対応。"
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm text-neutral-700 dark:text-neutral-300">
                    ターゲット
                  </Label>
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

              <div className="pt-2 flex items-center gap-2">
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

                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => reset()}
                  disabled={isLoading}
                >
                  リセット
                </Button>

                {submitDisabled && (
                  <span className="text-xs text-neutral-500">
                    {submitReason}
                  </span>
                )}
              </div>

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
              justCompleted &&
                "shadow-soft-md ring-2 ring-indigo-300/60"
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
                  animate={{
                    opacity: 1,
                    y: 0,
                    filter: "blur(0px)",
                  }}
                  transition={{ duration: 0.35 }}
                >
                  {typed}
                </motion.div>
              ) : (
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

            {/* 完成時の祝演出（延長済み） */}
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
                        style={{ top, left }}
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
                        exit={{ opacity: 0 }}
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
                    transition={{ duration: 0.4 }}
                  >
                    <div className="rounded-full bg-white/90 shadow-md border px-4 py-1.5 text-xs font-medium text-gray-800 backdrop-blur">
                      素敵な仕上がりです ✨
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>

            {/* 枠のリング・やわらかいハイライト */}
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
