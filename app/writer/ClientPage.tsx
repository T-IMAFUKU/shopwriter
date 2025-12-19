// app/writer/ClientPage.tsx
// H-8 LEVEL 2：段階描画（ストリーム対応 + 擬似ストリームFallback）
// - 送信直後：Thinkingストリップ
// - 300ms後：Skeleton
// - 最初の段落が届いた瞬間：即描画（TTFP最小化）
// - 以降：段落ごとに逐次追記（真のストリーム or 擬似ストリーム）
// 注意：styled-jsx を使わず Tailwind で演出（過去の panic 回避）

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
   Durations / UI timings
========================= */
const DUR = {
  TYPEWRITER_MS: 32,
  SPIN_MIN_MS: 700,
  DONE_BADGE_MS: 5000,
  CELEB_MS: 5200,
  SKELETON_DELAY_MS: 300,
  PSEUDO_STREAM_INTERVAL_MS: 220, // フォールバック：段落ごと追加の間隔
};

/* =========================
   Form schema
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
   Props
========================= */
type ClientPageProps = {
  /** /writer?productId=xxx から渡される商品ID（なければ null/undefined） */
  productId?: string | null;
};

/* =========================
   Utils
========================= */
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function basicMarkdownToHtml(src: string): string {
  if (!src) return "";
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let listBuf: string[] = [];

  const flushList = () => {
    if (!listBuf.length) return;
    html.push("<ul>" + listBuf.map((i) => `<li>${i}</li>`).join("") + "</ul>");
    listBuf = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("### ")) {
      flushList();
      html.push(`<h3>${escapeHtml(line.replace(/^###\s+/, ""))}</h3>`);
      continue;
    }
    if (line.startsWith("## ")) {
      flushList();
      html.push(`<h2>${escapeHtml(line.replace(/^##\s+/, ""))}</h2>`);
      continue;
    }
    if (line.startsWith("- ")) {
      listBuf.push(escapeHtml(line.replace(/^-+\s*/, "")));
      continue;
    }
    if (line === "") {
      flushList();
      html.push("<br/>");
      continue;
    }
    flushList();
    html.push(`<p>${escapeHtml(line)}</p>`);
  }
  flushList();
  return html.join("\n").replace(/(<br\/>\s*){2,}/g, "<br/>");
}

function splitParagraphs(text: string): string[] {
  if (!text) return [];
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 真のストリーム読取：ReadableStream(UTF-8) を段落単位でコールバック
 * - サーバが chunked text / SSE / NDJSON に限らず、届いた文字を蓄積
 * - 2つ以上の改行を「段落境界」として検出
 */
async function readStreamByParagraphs(
  body: ReadableStream<Uint8Array>,
  onParagraph: (p: string) => void,
  onFinish: (rest: string) => void,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // 2つ以上の改行を段落区切りとして切り出す
    const parts = buffer.split(/\n{2,}/);
    buffer = parts.pop() ?? ""; // 未確定バッファ
    for (const para of parts) {
      const clean = para.trim();
      if (clean) onParagraph(clean);
    }
  }

  const rest = buffer.trim();
  onFinish(rest);
}

/* =========================
   API: ストリーム対応 fetch
========================= */
async function callWriterStreaming(payload: {
  meta: Record<string, any>;
  prompt: string;
  productId?: string | null;
}) {
  const res = await fetch("/api/writer", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-shopwriter-stream": "1", // サーバ側が見ていればストリームで返すヒント
    },
    body: JSON.stringify(payload),
  });
  return res;
}

/* =========================
   Main Component
========================= */
export default function ClientPage({ productId }: ClientPageProps) {
  const hasProductFacts = !!productId;

  // 出力保持
  const [result, setResult] = useState(""); // 全文（コピー/共有用）
  const [leadHtml, setLeadHtml] = useState(""); // 先頭段落（HTML）
  const [restParasHtml, setRestParasHtml] = useState<string[]>([]); // 2段落目以降（HTML配列・段階描画）
  // PRODUCT_FACTS（/api/writer の meta.productFacts をそのまま保持）
  const [productFacts, setProductFacts] = useState<any | null>(null);

  // 状態
  const [isLoading, setIsLoading] = useState(false);
  const [shareId, setShareId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // 演出
  const [showThinking, setShowThinking] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const [showDoneBadge, setShowDoneBadge] = useState(false);

  // タイマー
  const skeletonTimerRef = useRef<number | null>(null);
  const celebTimerRef = useRef<number | null>(null);
  const badgeTimerRef = useRef<number | null>(null);
  const pseudoStreamTimerRef = useRef<number | null>(null);

  // TTFP 計測
  const tSubmitRef = useRef<number | null>(null);
  const tFirstPaintRef = useRef<number | null>(null);

  // 出力カードへスクロール
  const resultRef = useRef<HTMLDivElement | null>(null);
  const prefersReduce = useReducedMotion();
  const scrollToResultSmart = useCallback(() => {
    const el = resultRef.current;
    if (!el) return;
    const run = () => {
      const OFFSET = 120;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const visibleEnough = rect.top >= 64 && rect.bottom <= vh - 96;
      if (visibleEnough) return;
      window.scrollTo({
        top: Math.max(0, rect.top + window.scrollY - OFFSET),
        behavior: prefersReduce ? "auto" : "smooth",
      });
    };
    requestAnimationFrame(() => requestAnimationFrame(run));
  }, [prefersReduce]);

  // Form
  const {
    register,
    handleSubmit,
    formState: { errors, isValid, isSubmitting, dirtyFields },
    watch,
    reset,
    control,
    setValue,
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
  const product = watch("product");
  const featuresLen = [...(watch("features") ?? "")].length;

  /* =========================
     L2-11: productId -> product.name 初回のみ自動セット（手入力は上書きしない）
  ========================= */
  const prefillDoneForProductIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!productId) return;
    if (prefillDoneForProductIdRef.current === productId) return;

    // すでに入力済み、またはユーザーが触っているなら何もしない
    const alreadyTyped = (product ?? "").trim().length > 0;
    const userEdited = !!(dirtyFields as any)?.product;
    if (alreadyTyped || userEdited) {
      prefillDoneForProductIdRef.current = productId;
      return;
    }

    const ac = new AbortController();

    (async () => {
      try {
        // まずは一般的な形：/api/products/:id
        const res = await fetch(`/api/products/${encodeURIComponent(productId)}`, {
          method: "GET",
          headers: { "content-type": "application/json" },
          signal: ac.signal,
        });

        if (!res.ok) {
          // 失敗しても現状維持（ガード/課金/Writerを壊さない）
          prefillDoneForProductIdRef.current = productId;
          return;
        }

        const j: any = await res.json().catch(() => ({}));
        const name =
          (typeof j?.name === "string" && j.name) ||
          (typeof j?.product?.name === "string" && j.product.name) ||
          (typeof j?.data?.name === "string" && j.data.name) ||
          "";

        const clean = String(name || "").trim();
        if (!clean) {
          prefillDoneForProductIdRef.current = productId;
          return;
        }

        // 直前でユーザーが入力した可能性もあるので再チェック
        const stillEmpty = (watch("product") ?? "").trim().length === 0;
        const stillNotDirty = !!(dirtyFields as any)?.product === false;
        if (!stillEmpty || !stillNotDirty) {
          prefillDoneForProductIdRef.current = productId;
          return;
        }

        setValue("product", clean, {
          shouldDirty: false,
          shouldTouch: false,
          shouldValidate: true,
        });

        prefillDoneForProductIdRef.current = productId;
      } catch {
        // Abort/通信失敗などは握りつぶし（現状維持）
        prefillDoneForProductIdRef.current = productId;
      }
    })();

    return () => {
      ac.abort();
    };
    // dirtyFields/product を依存に入れると毎回動きやすいので、最小の依存に寄せる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, setValue, watch, product]);

  /* =========================
     クリーンアップ
  ========================= */
  useEffect(() => {
    return () => {
      if (skeletonTimerRef.current) clearTimeout(skeletonTimerRef.current);
      if (celebTimerRef.current) clearTimeout(celebTimerRef.current);
      if (badgeTimerRef.current) clearTimeout(badgeTimerRef.current);
      if (pseudoStreamTimerRef.current)
        clearTimeout(pseudoStreamTimerRef.current);
    };
  }, []);

  /* =========================
     コピー / 共有
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

  async function createShare(params: { title: string; body: string }) {
    const headers: HeadersInit = {
      "content-type": "application/json",
    };
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

  const doShare = useCallback(async () => {
    setError(null);
    setShareId(null);
    try {
      if (!result)
        throw new Error("共有する本文がありません。先に生成してください。");
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
                      "noopener,noreferrer",
                    );
                  } catch {}
                },
              }
            : undefined,
        });
      } else {
        const j = await res.json().catch(() => ({}));
        const msg =
          j?.message || j?.error || `共有に失敗しました（${res.status}）`;
        throw new Error(msg);
      }
    } catch (e: any) {
      const msg = e?.message ?? "共有に失敗しました。";
      setError(msg);
      toast.error("共有できませんでした", {
        description: msg,
      });
    }
  }, [product, result]);

  /* =========================
     送信（LEVEL 2：段階描画）
  ========================= */
  const onSubmit = useCallback(
    async (vals: FormValues) => {
      setError(null);
      setShareId(null);
      setIsLoading(true);

      // 表示系リセット
      setResult("");
      setLeadHtml("");
      setRestParasHtml([]);
      setProductFacts(null);
      setJustCompleted(false);
      setShowDoneBadge(false);

      // Thinking / Skeleton
      setShowThinking(true);
      if (skeletonTimerRef.current) clearTimeout(skeletonTimerRef.current);
      skeletonTimerRef.current = window.setTimeout(
        () => setShowSkeleton(true),
        DUR.SKELETON_DELAY_MS,
      );

      // タイマー
      if (celebTimerRef.current) {
        clearTimeout(celebTimerRef.current);
        celebTimerRef.current = null;
      }
      if (badgeTimerRef.current) {
        clearTimeout(badgeTimerRef.current);
        badgeTimerRef.current = null;
      }
      if (pseudoStreamTimerRef.current) {
        clearTimeout(pseudoStreamTimerRef.current);
        pseudoStreamTimerRef.current = null;
      }

      // 計測
      tSubmitRef.current = performance.now();

      // Prompt 構築（既存踏襲）
      const sections: string[] = [
        `# プロダクト: ${vals.product}`,
        `# 用途: ${vals.purpose}`,
        `# 特徴: ${vals.features}`,
        `# ターゲット: ${vals.audience}`,
        `# トーン: ${vals.tone}`,
        `# テンプレ: ${vals.template} / 長さ: ${vals.length} / CTA: ${
          vals.cta ? "あり" : "なし"
        }`,
        "",
        "## 出力要件",
        "- 日本語",
        "- 具体的・簡潔・販売導線を意識",
      ];
      if (vals.template === "lp")
        sections.push("- 見出し→特長→CTA の順でセクション化");
      if (vals.template === "email")
        sections.push("- 件名→本文（導入/要点/CTA）");
      if (vals.template === "sns_short")
        sections.push("- 140字以内を目安、ハッシュタグ2つまで");
      if (vals.template === "headline_only")
        sections.push("- ヘッドライン案を3つ");
      const prompt = sections.join("\n");

      const payload = {
        meta: {
          template: vals.template,
          tone: vals.tone,
          length: vals.length,
          cta: vals.cta,
        },
        prompt,
        productId,
      } as const;

      try {
        const res = await callWriterStreaming(payload);

        // ストリーム可否判定
        const ct = res.headers.get("content-type") || "";
        const looksJson = ct.includes("application/json");
        const canStream = !!res.body && !looksJson;

        if (canStream && res.ok) {
          // 真のストリーム：段落単位で描画
          setShowThinking(true);
          const parasArr: string[] = [];
          let firstPainted = false;

          const stream = res.body as ReadableStream<Uint8Array>;
          await readStreamByParagraphs(
            stream,
            (para) => {
              parasArr.push(para);
              if (!firstPainted) {
                const lead = parasArr.shift() ?? "";
                if (lead) {
                  setLeadHtml(basicMarkdownToHtml(lead));
                  tFirstPaintRef.current = performance.now();
                  setShowSkeleton(false);
                  setShowThinking(false);
                  scrollToResultSmart();
                  firstPainted = true;
                }
              } else {
                setRestParasHtml((prev) => [
                  ...prev,
                  basicMarkdownToHtml(para),
                ]);
              }
            },
            (rest) => {
              if (!firstPainted && rest) {
                setLeadHtml(basicMarkdownToHtml(rest)); // 全文1段落
                tFirstPaintRef.current = performance.now();
                firstPainted = true;
              } else if (rest) {
                setRestParasHtml((prev) => [
                  ...prev,
                  basicMarkdownToHtml(rest),
                ]);
              }
            },
          );

          // stream 経路では meta.productFacts は扱わず、
          // PRODUCT_FACTS パネルは JSON レスポンス時のみ更新する方針。
          const plain = [leadHtmlToPlain(), ...restParasToPlain()]
            .join("\n\n")
            .trim();
          setResult(plain);

          // 完了演出
          setShowThinking(false);
          setShowSkeleton(false);
          setJustCompleted(true);
          setShowDoneBadge(true);
          celebTimerRef.current = window.setTimeout(
            () => setJustCompleted(false),
            DUR.CELEB_MS,
          );
          badgeTimerRef.current = window.setTimeout(
            () => setShowDoneBadge(false),
            DUR.DONE_BADGE_MS,
          );

          console.debug(
            "[H-8/L2] stream TTFP(ms) ≈",
            Math.round(
              (tFirstPaintRef.current ?? 0) - (tSubmitRef.current ?? 0),
            ),
          );
          setIsLoading(false);
          return;
        }

        // フォールバック：JSON 一括
        const j = await res.json().catch(() => ({} as any));
        const text =
          (j?.data?.text as string) ??
          (j?.output as string) ??
          (typeof j === "string" ? j : "");

        // PRODUCT_FACTS を meta からそのまま取得して表示
        const pf = (j as any)?.data?.meta?.productFacts ?? null;
        setProductFacts(pf ?? null);

        if (!text) throw new Error(j?.message || "生成結果が空でした。");

        const [lead, ...rest] = splitParagraphs(text);
        if (lead) {
          setLeadHtml(basicMarkdownToHtml(lead));
          tFirstPaintRef.current = performance.now();
          setShowSkeleton(false);
          setShowThinking(false);
          scrollToResultSmart();
        }

        // 残りを段階描画
        let i = 0;
        const pushNext = () => {
          if (i >= rest.length) {
            setJustCompleted(true);
            setShowDoneBadge(true);
            celebTimerRef.current = window.setTimeout(
              () => setJustCompleted(false),
              DUR.CELEB_MS,
            );
            badgeTimerRef.current = window.setTimeout(
              () => setShowDoneBadge(false),
              DUR.DONE_BADGE_MS,
            );
            return;
          }
          setRestParasHtml((prev) => [...prev, basicMarkdownToHtml(rest[i])]);
          i += 1;
          pseudoStreamTimerRef.current = window.setTimeout(
            pushNext,
            DUR.PSEUDO_STREAM_INTERVAL_MS,
          );
        };
        if (rest.length) {
          pseudoStreamTimerRef.current = window.setTimeout(
            pushNext,
            DUR.PSEUDO_STREAM_INTERVAL_MS,
          );
        } else {
          setJustCompleted(true);
          setShowDoneBadge(true);
          celebTimerRef.current = window.setTimeout(
            () => setJustCompleted(false),
            DUR.CELEB_MS,
          );
          badgeTimerRef.current = window.setTimeout(
            () => setShowDoneBadge(false),
            DUR.DONE_BADGE_MS,
          );
        }

        setResult(text);
        console.debug(
          "[H-8/L2] pseudo-stream TTFP(ms) ≈",
          Math.round(
            (tFirstPaintRef.current ?? 0) - (tSubmitRef.current ?? 0),
          ),
        );
        setIsLoading(false);
      } catch (e: any) {
        setIsLoading(false);
        setShowThinking(false);
        setShowSkeleton(false);
        const msg = e?.message ?? "生成に失敗しました。";
        setError(msg);
        toast.error("生成できませんでした", {
          description: msg,
        });
      }
    },
    [scrollToResultSmart, productId],
  );

  // plain text 再構成（結果整形用）
  const leadHtmlToPlain = () => {
    if (!leadHtml) return "";
    const tmp = document.createElement("div");
    tmp.innerHTML = leadHtml;
    return tmp.textContent || tmp.innerText || "";
  };
  const restParasToPlain = () => {
    const arr: string[] = [];
    for (const h of restParasHtml) {
      const tmp = document.createElement("div");
      tmp.innerHTML = h;
      arr.push(tmp.textContent || tmp.innerText || "");
    }
    return arr;
  };

  // onSubmit ラッパ：宣言順を整理して安全に参照
  const submit = useCallback(() => {
    if (isLoading || isSubmitting || !isValid) return;
    void handleSubmit(onSubmit)();
  }, [handleSubmit, isLoading, isSubmitting, isValid, onSubmit]);

  /* =========================
     Ctrl/⌘ + Enter
  ========================= */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // @ts-ignore
      if ((e as any).isComposing) return;
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!(mod && e.key === "Enter")) return;
      e.preventDefault();
      submit();
    };
    document.addEventListener("keydown", handler, {
      passive: false,
    });
    return () => {
      document.removeEventListener("keydown", handler);
    };
  }, [submit]);

  /* =========================
     背景モーション
  ========================= */
  const { scrollYProgress } = useScroll();
  const orbUp = useTransform(scrollYProgress, [0, 1], [0, -80]);
  const orbDown = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const fadeBg = useTransform(scrollYProgress, [0, 0.3], [1, 0.8]);

  /* =========================
     PRODUCT_FACTS のUI用整形
  ========================= */
  const productFactsItems: Array<{
    kind?: string;
    label?: string;
    value?: string;
    sourceId?: string;
  }> = Array.isArray((productFacts as any)?.items)
    ? ((productFacts as any).items as any[])
    : [];
  const hasReadableProductFacts = hasProductFacts && productFactsItems.length > 0;

  /* =========================
     提出UI
  ========================= */
  const submitDisabled = !isValid || isLoading || isSubmitting;
  const submitReason = !isValid
    ? "必須項目の入力条件を満たしていません（それぞれのエラーメッセージを確認）"
    : isLoading || isSubmitting
      ? "実行中です"
      : "";

  return (
    <div className="relative min-h-[calc(100dvh-160px)] isolate before:absolute before:inset-0 before:-z-20 before:bg-[linear-gradient(180deg,#F3F6FF_0%,#F9FBFF_50%,#FFFFFF_100%)]">
      {/* グローバル変数（色相） */}
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

      {/* 背景オーブ */}
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

      {/* Hero */}
      <div className="mx-auto max-w-7xl px-8 md:px-12 pt-8 md:pt-16 pb-6 md:pb-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
        >
          <div className="relative mx-auto w-full max-w-xl rounded-2xl border border-white/40 bg-white/60 px-5 py-6 shadow-[0_30px_120px_rgba(16,24,64,0.12)] ring-1 ring-black/5 backdrop-blur-md md:px-8 md:py-8">
            <h1 className="text-[28px] leading-[1.15] font-bold tracking-tight text-neutral-900 md:text-[40px] md:leading-[1.25] text-center">
              <span className="block">あなたの言葉を、</span>
              <span className="block bg-gradient-to-r from-indigo-600 to-violet-500 bg-clip-text text-transparent">
                AIで磨く。
              </span>
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-neutral-700 md:text-base md:leading-relaxed md:max-w-prose text-center">
              目的・強み・話し方を入力すると、そのまま使える紹介文やLP用コピーを仕上げます。
            </p>
            <div className="mt-5 flex justify-center">
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
            </div>
            <div className="mt-4 text-center text-[11px] text-neutral-500">
              βテスト中：フィードバック歓迎
            </div>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-indigo-500/10 [mask-image:radial-gradient(60%_50%_at_50%_50%,black,transparent)]"
            />
          </div>
        </motion.div>
      </div>

      {/* ステップ表示 + PRODUCT_FACTS */}
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
              isLoading ? "bg-indigo-50 text-indigo-700" : "bg-white/70",
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

        {hasProductFacts && (
          <div className="mt-2 flex justify-center">
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] text-emerald-700">
              <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
              商品情報を反映しています
            </span>
          </div>
        )}

        {hasProductFacts && productFacts && (
          <div className="mt-3 max-w-3xl mx-auto">
            <Card className="border-emerald-100 bg-emerald-50/60 dark:bg-emerald-950/40 dark:border-emerald-900 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="inline-flex size-5 items-center justify-center rounded-full bg-emerald-600/15 text-emerald-700 text-[11px] font-semibold">
                    DB
                  </span>
                  <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-100">
                    商品情報（PRODUCT_FACTS）
                  </p>
                </div>
                <p className="text-[10px] text-emerald-700/80 dark:text-emerald-200/80">
                  ※ DBから取得した商品仕様だけを、そのまま表示しています
                </p>
              </div>

              {hasReadableProductFacts ? (
                <div className="mt-3 rounded-md bg-white/80 dark:bg-neutral-950/60 border border-emerald-100/70 dark:border-emerald-800/70 px-3 py-2 text-[11px] text-emerald-900 dark:text-emerald-50">
                  <div className="space-y-1.5">
                    {productFactsItems.map((item, index) => (
                      <div
                        key={`${item.sourceId ?? item.label ?? "item"}-${index}`}
                        className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-0.5 sm:gap-2 border-b border-emerald-100/70 last:border-none py-1.5"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-medium truncate">
                            {item.label ?? "項目"}
                          </span>
                          {item.kind && (
                            <span className="text-[10px] text-emerald-700/70">
                              {item.kind === "spec" ? "（仕様）" : "（属性）"}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-emerald-900 dark:text-emerald-50 whitespace-pre-wrap break-words max-w-full sm:max-w-[60%]">
                          {item.value ?? "-"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-2 rounded-md bg-white/80 dark:bg-neutral-950/60 border border-emerald-100/70 dark:border-emerald-800/70 px-3 py-2 max-h-56 overflow-auto text-[11px] font-mono text-emerald-900 dark:text-emerald-50 whitespace-pre">
                  {JSON.stringify(productFacts, null, 2)}
                </div>
              )}
            </Card>
          </div>
        )}
      </div>

      {/* 2カラム */}
      <div className="mx-auto max-w-7xl px-8 md:px-12 py-6 grid grid-cols-1 lg:grid-cols-[1.1fr,0.9fr] gap-8">
        {/* 左：フォーム */}
        <motion.section
          initial={{ opacity: 0, y: 6 }}
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
              onSubmit={(e) => {
                e.preventDefault();
                submit();
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
                      "border-red-300 focus-visible:ring-red-400",
                  )}
                  {...register("product")}
                />
                {errors.product && (
                  <p className="text-xs text-red-500">{errors.product.message}</p>
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
                      "border-red-300 focus-visible:ring-red-400",
                  )}
                  {...register("purpose")}
                />
                {errors.purpose && (
                  <p className="text-xs text-red-500">{errors.purpose.message}</p>
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
                      "border-red-300 focus-visible:ring-red-400",
                  )}
                  {...register("features")}
                />
                {errors.features ? (
                  <p className="text-xs text-red-500">{errors.features.message}</p>
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
                    <p className="text-xs text-neutral-500">購入/申込の導線を明示</p>
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

              {/* アクション */}
              <div className="pt-2 flex items-center gap-2 flex-wrap">
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

        {/* 右：出力 */}
        <motion.section
          ref={resultRef}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05 }}
        >
          <Card
            className={clsx(
              "relative p-5 md:p-6 overflow-visible",
              justCompleted && "shadow-soft-md ring-2 ring-indigo-300/60",
            )}
          >
            <div className="mb-3 flex items-center justify-between flex-wrap gap-3">
              <div className="inline-flex items-center gap-2">
                <span className="inline-flex size-6 items-center justify-center rounded-full bg-indigo-600/15 text-indigo-700 text-xs font-semibold">
                  3
                </span>
                <h2 className="text-sm font-semibold">出力</h2>
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

            {/* Thinking strip */}
            <AnimatePresence initial={false}>
              {showThinking && (
                <motion.div
                  key="thinking-strip"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18 }}
                  className="mb-3 rounded-md border bg-gradient-to-r from-indigo-50 to-violet-50 px-3 py-2 text-xs text-indigo-700"
                  role="status"
                  aria-live="polite"
                >
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1">
                      <span className="size-2 rounded-full bg-indigo-500 animate-ping" />
                      <span className="size-2 rounded-full bg-indigo-500 animate-pulse" />
                      <span className="size-2 rounded-full bg-indigo-500 animate-pulse [animation-delay:200ms]" />
                    </span>
                    <span>AIが考えています…</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* エラー */}
            {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

            {/* 段階描画本文 */}
            <div className="prose prose-sm dark:prose-invert max-w-none leading-relaxed">
              {showSkeleton ? (
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
              ) : leadHtml || restParasHtml.length > 0 ? (
                <div className="whitespace-normal break-words">
                  {leadHtml && (
                    <div
                      // eslint-disable-next-line react/no-danger
                      dangerouslySetInnerHTML={{ __html: leadHtml }}
                    />
                  )}
                  {restParasHtml.map((h, idx) => (
                    <motion.div
                      // eslint-disable-next-line react/no-danger
                      dangerouslySetInnerHTML={{ __html: h }}
                      key={idx}
                      initial={{ opacity: 0, y: 6, filter: "blur(2px)" }}
                      animate={{
                        opacity: 1,
                        y: 0,
                        filter: "blur(0px)",
                      }}
                      transition={{ duration: 0.28 }}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-neutral-500">生成結果がここに表示されます。</p>
              )}
            </div>

            {/* 完了演出 */}
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
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.98 }}
                    transition={{ duration: 0.4 }}
                  >
                    <div className="rounded-full bg-white/90 shadow-md border px-4 py-1.5 text-xs font-medium text-gray-800 backdrop-blur">
                      素敵な仕上がりです ✨
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>

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
