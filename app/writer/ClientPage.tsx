// app/writer/ClientPage.tsx
// H-8 LEVEL 2：段階描画（ストリーム対応 + 擬似ストリームFallback）
// - 送信直後：Thinkingストリップ
// - 300ms後：Skeleton
// - 最初の段落が届いた瞬間：即描画（TTFP最小化）
// - 以降：段落ごとに逐次追記（真のストリーム or 擬似ストリーム）
// 注意：styled-jsx を使わず Tailwind で演出（過去の panic 回避）

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
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
  Info,
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
   A1: "薄い" 判定（事故耐性優先 / 誤検知を避ける軽め実装）
   - 3指標のうち2つ以上NG → isThin=true
   - 判定対象：生成本文テキスト（result相当）
========================= */
const THIN = {
  SCENE_WORDS: [
    "自宅",
    "在宅",
    "オフィス",
    "デスク",
    "仕事",
    "休憩",
    "通勤",
    "朝",
    "昼",
    "夜",
    "休日",
    "外出",
    "会議",
    "作業",
  ],
  ABSTRACT_WORDS: ["快適", "便利", "使いやすい", "高品質", "安心", "おすすめ"],
  CONCRETE_VERBS: ["減る", "保つ", "防ぐ", "守る", "抑える", "支える", "整える"],
  MATERIAL_WORDS: [
    "ステンレス",
    "アルミ",
    "チタン",
    "セラミック",
    "ガラス",
    "木",
    "竹",
    "綿",
    "コットン",
    "シルク",
    "ナイロン",
    "ポリエステル",
    "レザー",
    "革",
  ],
};

/* =========================
   Prescription Layer v1 (Light A1)
   - A1 は「圧」を出さない（最大2ヒント）
   - reasons が取れない場合でも本文から軽く推定して UX を成立させる
========================= */
type ReasonCode =
  | "ABSTRACT_WORD_BODY"
  | "HAS_ABSTRACT_SUMMARY_WORD"
  | "HEAD2_EVALUATIVE_OR_ABSTRACT"
  | "HEAD_HAS_CAN_DO_PHRASE"
  | "HEAD_HAS_BANNED_WORD";

const ABSTRACT_SUMMARY_WORDS = [
  "便利",
  "効果的",
  "実現",
  "活用",
  "魅力",
  "使いやすい",
  "おすすめ",
  "快適",
  "安心",
  "高品質",
];

// P2: できる/できます系 & 評価語/まとめ語っぽさ（軽い推定）
const HEAD_CAN_DO_PHRASES = ["できます", "できる", "可能です", "対応できます"];
const HEAD_BANNED_LIKE = ["最適", "ぴったり", "おすすめ", "理想", "完璧"];

function normalizeForThin(s: string) {
  return (s ?? "")
    .replace(/\u3000/g, " ")
    .replace(/[\r\n]+/g, "\n")
    .trim();
}

function countDistinctHits(text: string, words: string[]) {
  const t = normalizeForThin(text);
  if (!t) return 0;
  let n = 0;
  for (const w of words) {
    if (!w) continue;
    if (t.includes(w)) n += 1;
  }
  return n;
}

function buildProductTokens(productName: string) {
  const tokens = new Set<string>();

  const p = (productName ?? "").trim();
  if (p) {
    tokens.add(p);
    const parts = p
      .split(/[\s\-_/()（）【】\[\]「」『』・、。]+/g)
      .map((x) => x.trim())
      .filter(Boolean);
    for (const part of parts.slice(0, 4)) {
      if (part.length >= 2) tokens.add(part);
    }
  }

  for (const w of THIN.MATERIAL_WORDS) tokens.add(w);

  return Array.from(tokens)
    .map((x) => x.trim())
    .filter((x) => x.length >= 2)
    .slice(0, 14);
}

function getThinSignals(text: string, productName: string) {
  const t = normalizeForThin(text);

  const sceneHits = countDistinctHits(t, THIN.SCENE_WORDS);
  const abstractHits = countDistinctHits(t, THIN.ABSTRACT_WORDS);
  const verbHits = countDistinctHits(t, THIN.CONCRETE_VERBS);

  const tokens = buildProductTokens(productName);
  const specificHits = countDistinctHits(t, tokens);

  const ng1 = sceneHits <= 1; // 利用シーン語 <=1
  const ng2 = abstractHits >= 2 && verbHits === 0; // 抽象語が多い & 具体動詞0
  const ng3 = specificHits <= 1; // 商品固有語の出現 <=1

  const ngCount = [ng1, ng2, ng3].filter(Boolean).length;
  const isThin = ngCount >= 2;

  // ✅ “薄い”の短い指摘（既存）— ここは軽いガイドとして残す（最大2）
  const points: string[] = [];
  if (ng1) points.push("② 利用シーン：1つ追加すると用途・目的に追記されます");
  if (ng3) points.push("③ 具体性：数値や仕様ワードを1つ追加すると特徴・強みに追記されます");

  // ng2（抽象語多め）は “責める文言” になりやすいので、短い方向へ寄せる
  if (points.length < 2 && ng2) {
    points.push("③ 具体性：数値や仕様ワードを1つ追加すると特徴・強みに追記されます");
  }

  return {
    isThin,
    points: Array.from(new Set(points)).slice(0, 2),
    debug: { ng1, ng2, ng3, sceneHits, abstractHits, verbHits, specificHits },
  };
}

function splitFirstTwoSentences(src: string) {
  const t = normalizeForThin(src);
  if (!t) return { s1: "", s2: "" };

  // ざっくり句点で2文へ（UI推定用。厳密でなくOK）
  const parts = t.split("。").map((x) => x.trim()).filter(Boolean);
  const s1 = parts[0] ? `${parts[0]}。` : "";
  const s2 = parts[1] ? `${parts[1]}。` : "";
  return { s1, s2 };
}

function inferReasonCodesFromText(text: string): ReasonCode[] {
  const t = normalizeForThin(text);
  if (!t) return [];

  const { s1, s2 } = splitFirstTwoSentences(t);
  const reasons = new Set<ReasonCode>();

  // ABSTRACT系（本文全体）
  const hasSummary = ABSTRACT_SUMMARY_WORDS.some((w) => t.includes(w));
  if (hasSummary) reasons.add("HAS_ABSTRACT_SUMMARY_WORD");

  // 「快適/便利/使いやすい…」が複数回混ざると ABSTRACT_WORD_BODY 扱い
  const abstractBodyHits = countDistinctHits(t, ABSTRACT_SUMMARY_WORDS);
  if (abstractBodyHits >= 2) reasons.add("ABSTRACT_WORD_BODY");

  // HEAD系（冒頭）
  if (HEAD_CAN_DO_PHRASES.some((w) => s1.includes(w))) reasons.add("HEAD_HAS_CAN_DO_PHRASE");
  if (HEAD_BANNED_LIKE.some((w) => s1.includes(w))) reasons.add("HEAD_HAS_BANNED_WORD");

  // 2文目が「評価/抽象寄り」なら
  const s2Abstract = ABSTRACT_SUMMARY_WORDS.some((w) => s2.includes(w));
  const s2HasCanDo = HEAD_CAN_DO_PHRASES.some((w) => s2.includes(w));
  if (s2 && (s2Abstract || s2HasCanDo)) reasons.add("HEAD2_EVALUATIVE_OR_ABSTRACT");

  return Array.from(reasons);
}

/**
 * A1の“圧ゼロ”ヒント（最大2）
 * - 「禁止」ではなく「次はここだけ足すと伸びる」へ寄せる
 * - 事前に用意した固定文の2択ではなく、状況（thin/reasons）で候補が変わる
 */
type A1HintKey =
  | "H_SCENE"
  | "H_SPEC"
  | "H_ABSTRACT_TO_FACT"
  | "H_HEAD_TO_SCENE"
  | "H_CAN_DO_TO_RESULT"
  // ✅ 入力ベース dynamicA1 用（Top-1）
  | "H_PURPOSE"
  | "H_FEATURES"
  | "H_NUMERIC";

type A1HintItem = {
  key: A1HintKey;
  text: string; // 1行で完結（短い）
  example?: string; // 例は短く（括弧で収まる）
};

function uniqHintItems(items: A1HintItem[]) {
  const seen = new Set<A1HintKey>();
  const out: A1HintItem[] = [];
  for (const it of items) {
    if (seen.has(it.key)) continue;
    seen.add(it.key);
    out.push(it);
  }
  return out;
}

function buildA1HintItems(args: {
  thinDebug?: { ng1?: boolean; ng2?: boolean; ng3?: boolean };
  reasons: ReasonCode[];
}): A1HintItem[] {
  const ng1 = !!args.thinDebug?.ng1;
  const ng2 = !!args.thinDebug?.ng2;
  const ng3 = !!args.thinDebug?.ng3;

  const hasAbstract =
    args.reasons.includes("HAS_ABSTRACT_SUMMARY_WORD") || args.reasons.includes("ABSTRACT_WORD_BODY");

  const headAbstract =
    args.reasons.includes("HEAD2_EVALUATIVE_OR_ABSTRACT") ||
    args.reasons.includes("HEAD_HAS_BANNED_WORD");

  const headCanDo = args.reasons.includes("HEAD_HAS_CAN_DO_PHRASE");

  const candidates: A1HintItem[] = [];

  // 優先度：薄さ判定の根拠（ng1/ng3）を先に出す → 次に表現面（abstract/head）
  if (ng1) {
    candidates.push({
      key: "H_SCENE",
      text: "利用シーンを1つだけ追加（用途・目的に追記されます）",
      example: "例：ランチ前（11時台）／雨の日の店頭／在宅デスク",
    });
  }

  if (ng3) {
    candidates.push({
      key: "H_SPEC",
      text: "数値・仕様を1つだけ追加（特徴・強みに追記されます）",
      example: "例：450ml／A4対応／強化ガラス／12席",
    });
  }

  if (!ng1 && hasAbstract) {
    candidates.push({
      key: "H_ABSTRACT_TO_FACT",
      text: "「便利/快適」などを“条件”に置き換え（単語でOK）",
      example: "例：予約不要／当日OK／徒歩3分",
    });
  }

  if (headAbstract) {
    candidates.push({
      key: "H_HEAD_TO_SCENE",
      text: "2文目を“状況”に寄せる（説明よりシーン）",
      example: "例：店頭ポスター用／初来店向け",
    });
  }

  if (headCanDo || ng2) {
    candidates.push({
      key: "H_CAN_DO_TO_RESULT",
      text: "「できます」を“結果”に言い換え（短くでOK）",
      example: "例：当日予約を増やす／問い合わせを増やす",
    });
  }

  return uniqHintItems(candidates).slice(0, 2); // ✅ 圧ゼロ：最大2
}

/* =========================
   A1 dynamic (入力のみ / 記憶なし / Top-1)
========================= */
function normalizeInputLite(s: string) {
  return (s ?? "").replace(/\u3000/g, " ").replace(/[\r\n]+/g, "\n").trim();
}

function hasAnyDigit(s: string) {
  const t = normalizeInputLite(s);
  if (!t) return false;
  return /[0-9０-９]/.test(t);
}

function splitSellingPointsLike(features: string) {
  const t = normalizeInputLite(features);
  if (!t) return [];
  return t
    .split(/\r?\n|・|•|\-|\u2022|,|、|;/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function hasSceneHintInText(s: string) {
  const t = normalizeInputLite(s);
  if (!t) return false;

  // 既存の scene words + ざっくり時間/場所っぽい記号
  if (THIN.SCENE_WORDS.some((w) => t.includes(w))) return true;
  if (t.includes("店頭") || t.includes("屋外") || t.includes("屋内")) return true;
  if (t.includes("時") || t.includes("分")) return true;
  return false;
}

function getInputA1State(args: {
  product: string;
  purpose: string;
  features: string;
}) {
  const purpose = normalizeInputLite(args.purpose);
  const features = normalizeInputLite(args.features);

  // 「そこそこ書いている人」でも拾えるように、バリデーションよりは少し高めの基準
  const purposeLen = [...purpose].length;
  const featuresLen = [...features].length;
  const featureItems = splitSellingPointsLike(features);

  const purposeOk = purposeLen >= 14; // 例：「〜したい」+ 何か条件 が入るとだいたい超える
  const featuresOk = featureItems.length >= 2 || featuresLen >= 30;

  const hasNumeric = hasAnyDigit(purpose + "\n" + features);
  const hasScene = hasSceneHintInText(purpose + "\n" + features);

  // Top-1（記憶なし）
  let hint: A1HintItem | null = null;

  if (!purposeOk) {
    hint = {
      key: "H_PURPOSE",
      text: "用途・目的に「誰が/何のために」を1つだけ追加（短文でOK）",
      example: "例：初めての人向け／忙しい平日用／在宅作業の集中用",
    };
  } else if (!featuresOk) {
    hint = {
      key: "H_FEATURES",
      text: "特徴・強みに「仕様/条件/機能」を1つだけ追加（単語でもOK）",
      example: "例：真空二重構造／A4対応／写真3枚まで／防水",
    };
  } else if (!hasNumeric) {
    // ✅ 数値は「用途＆特徴がOKのときのみ」対象（合意済み）
    hint = {
      key: "H_NUMERIC",
      text: "数値を1つだけ追加（特徴・強みに追記されます）",
      example: "例：450ml／12席／徒歩3分／最短10分",
    };
  } else if (!hasScene) {
    // 数値の次にシーン（段階的に上げる）
    hint = {
      key: "H_SCENE",
      text: "利用シーンを1つだけ追加（用途・目的に追記されます）",
      example: "例：ランチ前（11時台）／雨の日の店頭／在宅デスク",
    };
  }

  const isOn = !!hint;

  // 旧pointsの“軽い補助”は、入力ベースで最小限に合わせる（最大1〜2）
  const points: string[] = [];
  if (!hasScene) points.push("② 利用シーン：1つ追加すると用途・目的に追記されます");
  if (!hasNumeric) points.push("③ 具体性：数値や仕様ワードを1つ追加すると特徴・強みに追記されます");

  return {
    isOn,
    hintItems: hint ? [hint] : ([] as A1HintItem[]), // ✅ Top-1：常に最大1
    points: Array.from(new Set(points)).slice(0, 2),
    debug: {
      purposeLen,
      featuresLen,
      featureItemsCount: featureItems.length,
      purposeOk,
      featuresOk,
      hasNumeric,
      hasScene,
    },
  };
}

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
  tone: z.enum(["friendly", "professional", "casual", "energetic"]).default("friendly"),
  template: z.enum(["lp", "email", "sns_short", "headline_only"]).default("lp"),
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

    const parts = buffer.split(/\n{2,}/);
    buffer = parts.pop() ?? "";
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

  // ✅ required4 SSOT: 別フィールドで送る（密度A観測の入力カウントを立てる）
  productName: string;
  goal: string;
  audience: string;
  sellingPoints: string[];
}) {
  const res = await fetch("/api/writer", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-shopwriter-stream": "1",
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

  const [result, setResult] = useState("");
  const [leadHtml, setLeadHtml] = useState("");
  const [restParasHtml, setRestParasHtml] = useState<string[]>([]);
  const [productFacts, setProductFacts] = useState<any | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [shareId, setShareId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [showThinking, setShowThinking] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const [showDoneBadge, setShowDoneBadge] = useState(false);

  // A2: パネル開閉 + 補足入力（元フォームは「適用」まで触らない）
  const [a2Open, setA2Open] = useState(false); // A2: open/close
  const [a2Scene, setA2Scene] = useState(""); // A2: 利用シーン（補足）
  const [a2Feature, setA2Feature] = useState(""); // A2: 具体的な特徴（補足）

  const skeletonTimerRef = useRef<number | null>(null);
  const celebTimerRef = useRef<number | null>(null);
  const badgeTimerRef = useRef<number | null>(null);
  const pseudoStreamTimerRef = useRef<number | null>(null);

  const tSubmitRef = useRef<number | null>(null);
  const tFirstPaintRef = useRef<number | null>(null);

  const resultRef = useRef<HTMLDivElement | null>(null);

  // A1: 入力フォーム先頭へのスクロール（事故防止：入力自体は書き換えない）
  const formTopRef = useRef<HTMLDivElement | null>(null);

  // ✅ A2: パネルへスクロール用（SSOT）
  const a2PanelRef = useRef<HTMLDivElement | null>(null);

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

  const {
    register,
    handleSubmit,
    formState: { errors, isValid, isSubmitting, dirtyFields },
    watch,
    reset,
    control,
    setValue,
    getValues,
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
  const purpose = watch("purpose");
  const features = watch("features");
  const featuresLen = [...(features ?? "")].length;

  // ★ CTAトグル（UI側だけで差分を出す / API送信は不変）
  const ctaEnabled = !!watch("cta");

  // ✅ dynamicA1（入力のみ / 記憶なし / Top-1）
  const dynamicA1 = useMemo(() => {
    return getInputA1State({
      product: product ?? "",
      purpose: purpose ?? "",
      features: features ?? "",
    });
  }, [product, purpose, features]);

  // ✅ 旧thin（points表示）のみ入力ベースへ寄せる（resultは混ぜない）
  const thin = useMemo(() => {
    return {
      isThin: dynamicA1.isOn,
      points: dynamicA1.points,
      debug: dynamicA1.debug as any,
    };
  }, [dynamicA1]);

  // ✅ A1 “圧ゼロ”ヒント（Top-1：最大1）
  const a1HintItems = useMemo(() => {
    if (!dynamicA1.isOn) return [] as A1HintItem[];
    return dynamicA1.hintItems;
  }, [dynamicA1.isOn, dynamicA1.hintItems]);

  // A2: 表示条件（A1と同じ安全条件 + A1 on）
  const a2CanShow =
    !isLoading &&
    !error &&
    (leadHtml || restParasHtml.length > 0) &&
    dynamicA1.isOn; // ✅ A1が出ている時だけA2を出す（設計維持）

  // ✅ A2: document click ハック撤去（SSOTは A1ボタン onClick）
  // ※ここでは何もしない（設計固定）

  // A2: 「適用」＝ここで初めて元フォームへ反映（明示操作のみ）
  // ★ purpose は <Input>（単一行）なので、補足は「 / 」で連結して見た目と意味を保つ
  const a2Apply = useCallback(() => {
    const scene = a2Scene.trim();
    const feat = a2Feature.trim();

    if (!scene && !feat) {
      toast("補足内容が空です");
      return false;
    }

    let changed = false;

    if (scene) {
      const curRaw = getValues("purpose") || "";
      const cur = curRaw.trim();

      // 単一行の入力に \n を入れるとブラウザ側で潰れて「直結」に見えやすいので delimiter を固定
      const delimiter = " / ";
      const next = cur ? `${cur}${delimiter}${scene}` : scene;

      if (next !== curRaw) {
        setValue("purpose", next, { shouldDirty: true, shouldValidate: true });
        changed = true;
      }
    }

    if (feat) {
      const curRaw = getValues("features") || "";
      const cur = curRaw.trim();
      // features は Textarea なので改行でOK（意味が分離されて評価にも効きやすい）
      const next = cur ? `${cur}\n${feat}` : feat;

      if (next !== curRaw) {
        setValue("features", next, { shouldDirty: true, shouldValidate: true });
        changed = true;
      }
    }

    if (!changed) {
      toast("変更がありません");
      return false;
    }

    toast.success("補足内容を適用しました（このまま再生成します）");
    return true;
  }, [a2Scene, a2Feature, getValues, setValue]);

  // 同一productIdでの再prefill防止（ユーザー入力の上書き防止）
  const prefillDoneForProductIdRef = useRef<string | null>(null);

  /**
   * /writer?productId=... のときに、DBの商品情報を “静かに” 初期値反映する
   * - product.name  → product
   * - ProductAttribute key="purpose" → purpose
   * - ProductAttribute key="value"   → features
   *
   * ルール：
   * - 既にユーザーが入力/編集しているフィールドは上書きしない
   * - 未登録（null）の場合は触らない
   */
  useEffect(() => {
    if (!productId) return;
    if (prefillDoneForProductIdRef.current === productId) return;

    const ac = new AbortController();

    (async () => {
      try {
        const res = await fetch(`/api/products/${encodeURIComponent(productId)}`, {
          method: "GET",
          headers: { "content-type": "application/json" },
          signal: ac.signal,
        });

        if (!res.ok) {
          prefillDoneForProductIdRef.current = productId;
          return;
        }

        const j: any = await res.json().catch(() => ({}));

        const name =
          (typeof j?.name === "string" && j.name) ||
          (typeof j?.product?.name === "string" && j.product.name) ||
          (typeof j?.data?.name === "string" && j.data.name) ||
          "";

        const purpose =
          (typeof j?.purpose === "string" && j.purpose) ||
          (typeof j?.data?.purpose === "string" && j.data.purpose) ||
          "";

        const value =
          (typeof j?.value === "string" && j.value) ||
          (typeof j?.data?.value === "string" && j.data.value) ||
          "";

        const cleanName = String(name || "").trim();
        const cleanPurpose = String(purpose || "").trim();
        const cleanValue = String(value || "").trim();

        // 既に入力済み/編集済みのものは上書きしない（フィールド単位）
        const cur = getValues();

        const canSetProduct =
          cleanName &&
          (cur.product ?? "").trim().length === 0 &&
          !!(dirtyFields as any)?.product === false;

        const canSetPurpose =
          cleanPurpose &&
          (cur.purpose ?? "").trim().length === 0 &&
          !!(dirtyFields as any)?.purpose === false;

        const canSetFeatures =
          cleanValue &&
          (cur.features ?? "").trim().length === 0 &&
          !!(dirtyFields as any)?.features === false;

        if (canSetProduct) {
          setValue("product", cleanName, {
            shouldDirty: false,
            shouldTouch: false,
            shouldValidate: true,
          });
        }

        if (canSetPurpose) {
          setValue("purpose", cleanPurpose, {
            shouldDirty: false,
            shouldTouch: false,
            shouldValidate: true,
          });
        }

        if (canSetFeatures) {
          setValue("features", cleanValue, {
            shouldDirty: false,
            shouldTouch: false,
            shouldValidate: true,
          });
        }

        prefillDoneForProductIdRef.current = productId;
      } catch {
        prefillDoneForProductIdRef.current = productId;
      }
    })();

    return () => {
      ac.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, setValue, getValues, dirtyFields]);

  useEffect(() => {
    return () => {
      if (skeletonTimerRef.current) clearTimeout(skeletonTimerRef.current);
      if (celebTimerRef.current) clearTimeout(celebTimerRef.current);
      if (badgeTimerRef.current) clearTimeout(badgeTimerRef.current);
      if (pseudoStreamTimerRef.current) clearTimeout(pseudoStreamTimerRef.current);
    };
  }, []);

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
        // 🔒 共有カードは “まず非公開で作る” を維持
        // 公開ページ（/share/[id]）は isPublic=true が前提なので、
        // 作成直後の導線は “管理ページ” へ誘導する（A案）
        isPublic: false,
      }),
    });
  }

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
        const id = created.id || created?.data?.id || null;
        setShareId(id);

        toast.success("共有カードを作成しました", {
          description: "公開するには管理画面で「公開」をONにしてください。",
          action: id
            ? {
                label: "管理画面を開く",
                onClick: () => {
                  try {
                    // ✅ 作成直後は非公開なので、/share/[id] 直行は404になり得る
                    // まずは管理ページへ誘導して、公開トグルをONにしてもらう
                    window.open(`/dashboard/share/${id}`, "_blank", "noopener,noreferrer");
                  } catch {}
                },
              }
            : undefined,
        });
      } else {
        const j = await res.json().catch(() => ({}));
        const msg = j?.message || j?.error || `共有に失敗しました（${res.status}）`;
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

  const onSubmit = useCallback(
    async (vals: FormValues) => {
      setError(null);
      setShareId(null);
      setIsLoading(true);

      setResult("");
      setLeadHtml("");
      setRestParasHtml([]);
      setProductFacts(null);
      setJustCompleted(false);
      setShowDoneBadge(false);

      // A2: 再生成開始時は閉じる（既存思想を維持）
      setA2Open(false);
      setA2Scene("");
      setA2Feature("");

      setShowThinking(true);
      if (skeletonTimerRef.current) clearTimeout(skeletonTimerRef.current);
      skeletonTimerRef.current = window.setTimeout(
        () => setShowSkeleton(true),
        DUR.SKELETON_DELAY_MS,
      );

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

      tSubmitRef.current = performance.now();

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
      if (vals.template === "lp") sections.push("- 見出し→特長→CTA の順でセクション化");
      if (vals.template === "email") sections.push("- 件名→本文（導入/要点/CTA）");
      if (vals.template === "sns_short") sections.push("- 140字以内を目安、ハッシュタグ2つまで");
      if (vals.template === "headline_only") sections.push("- ヘッドライン案を3つ");
      const prompt = sections.join("\n");

      // ✅ required4 SSOT: 特徴・強みを配列化して送る（サーバ側で sellingPointsCount を立てる）
      const sellingPoints = (vals.features ?? "")
        .split(/\r?\n|・|•|\-|\u2022|,|、|;/)
        .map((s) => s.trim())
        .filter(Boolean);

      const payload = {
        meta: {
          template: vals.template,
          tone: vals.tone,
          length: vals.length,
          cta: vals.cta,
        },

        // ✅ required4 の元（別フィールド）
        productName: vals.product,
        goal: vals.purpose,
        audience: vals.audience,
        sellingPoints,

        prompt,
        productId,
      } as const;

      try {
        const res = await callWriterStreaming(payload);

        const ct = res.headers.get("content-type") || "";
        const looksJson = ct.includes("application/json");
        const canStream = !!res.body && !looksJson;

        if (canStream && res.ok) {
          setShowThinking(true);
          const parasArr: string[] = [];
          const plainParts: string[] = []; // ✅ R-1: state逆変換に依存しない plain 蓄積
          let firstPainted = false;

          const stream = res.body as ReadableStream<Uint8Array>;
          await readStreamByParagraphs(
            stream,
            (para) => {
              parasArr.push(para);
              plainParts.push(para); // ✅ 受信順で蓄積

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
                setRestParasHtml((prev) => [...prev, basicMarkdownToHtml(para)]);
              }
            },
            (rest) => {
              if (rest) plainParts.push(rest); // ✅ 末尾残りも蓄積

              if (!firstPainted && rest) {
                setLeadHtml(basicMarkdownToHtml(rest));
                tFirstPaintRef.current = performance.now();
                firstPainted = true;
              } else if (rest) {
                setRestParasHtml((prev) => [...prev, basicMarkdownToHtml(rest)]);
              }
            },
          );

          // ✅ R-1最優先：result(plain) は React state / DOM 逆変換に依存させない（ズレ防止）
          const plain = plainParts.join("\n\n").trim();
          setResult(plain);

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
            Math.round((tFirstPaintRef.current ?? 0) - (tSubmitRef.current ?? 0)),
          );
          setIsLoading(false);
          return;
        }

        const j = await res.json().catch(() => ({} as any));
        const text =
          (j?.data?.text as string) ??
          (j?.output as string) ??
          (typeof j === "string" ? j : "");

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
          Math.round((tFirstPaintRef.current ?? 0) - (tSubmitRef.current ?? 0)),
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

  const submit = useCallback(() => {
    if (isLoading || isSubmitting || !isValid) return;
    void handleSubmit(onSubmit)();
  }, [handleSubmit, isLoading, isSubmitting, isValid, onSubmit]);

  // ✅ A2: 「適用して再生成」＝ submit() 経由（TDZ根絶）
  const a2ApplyAndRegenerate = useCallback(() => {
    const ok = a2Apply();
    if (!ok) return;

    window.setTimeout(() => {
      submit();
    }, 0);
  }, [a2Apply, submit]);

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
    document.addEventListener("keydown", handler, { passive: false });
    return () => {
      document.removeEventListener("keydown", handler);
    };
  }, [submit]);

  const productFactsItems: Array<{
    kind?: string;
    label?: string;
    value?: string;
    sourceId?: string;
  }> = Array.isArray((productFacts as any)?.items)
    ? ((productFacts as any).items as any[])
    : [];
  const hasReadableProductFacts = hasProductFacts && productFactsItems.length > 0;

  const submitDisabled = !isValid || isLoading || isSubmitting;
  const submitReason = !isValid
    ? "必須項目の入力条件を満たしていません（それぞれのエラーメッセージを確認）"
    : isLoading || isSubmitting
      ? "実行中です"
      : "";

  return (
    <div className="relative">
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

      <div className="mx-auto max-w-7xl px-8 md:px-12 py-6 grid grid-cols-1 lg:grid-cols-[1.1fr,0.9fr] gap-8">
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
              {/* A1: 入力欄への安全なスクロール用（入力の自動書き換えはしない） */}
              <div ref={formTopRef} />

              <div>
                <Label className="text-sm text-neutral-700 dark:text-neutral-300">
                  商品名
                </Label>
                <Input
                  placeholder="例）ShopWriter"
                  aria-invalid={!!errors.product}
                  className={clsx(
                    errors.product && "border-red-300 focus-visible:ring-red-400",
                  )}
                  {...register("product")}
                />
                {errors.product && (
                  <p className="text-xs text-red-500">{errors.product.message}</p>
                )}
              </div>

              <div>
                <Label className="text-sm text-neutral-700 dark:text-neutral-300">
                  用途・目的
                </Label>
                <Input
                  placeholder="例）EC事業者向けに、商品紹介文やLP用コピーを効率よく作成したい"
                  aria-invalid={!!errors.purpose}
                  className={clsx(
                    errors.purpose && "border-red-300 focus-visible:ring-red-400",
                  )}
                  {...register("purpose")}
                />
                {errors.purpose && (
                  <p className="text-xs text-red-500">{errors.purpose.message}</p>
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
                  placeholder="例）AIが商品情報と用途をもとに、すぐに使える文章を自動生成。テンプレ設計により、LP・SNS向けの構成にも対応。入力がシンプルで、誰でも迷わず文章作成ができる。"
                  aria-invalid={!!errors.features}
                  className={clsx(
                    errors.features && "border-red-300 focus-visible:ring-red-400",
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm text-neutral-700 dark:text-neutral-300">
                    ターゲット
                  </Label>
                  <Input
                    placeholder="例）EC事業者／オンラインショップ運営者／マーケティング担当者"
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
                    className="w-full border rounded-md h-9 px-2 bg-background opacity-70 cursor-not-allowed"
                    disabled
                    aria-disabled="true"
                    {...register("tone")}
                  >
                    <option value="friendly">Coming soon</option>
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
                    <option value="lp">標準（おすすめ）</option>
                    <option value="sns_short">SNS</option>

                    <option value="" disabled>
                      ──────────────
                    </option>

                    <option value="email" disabled>
                      広告（Coming soon）
                    </option>
                    <option value="headline_only" disabled>
                      プロモーション（Coming soon）
                    </option>
                  </select>
                </div>

                <div>
                  <Label className="text-sm text-neutral-700 dark:text-neutral-300">
                    長さ
                  </Label>
                  <select
                    className="w-full border rounded-md h-9 px-2 bg-background opacity-70 cursor-not-allowed"
                    disabled
                    aria-disabled="true"
                    {...register("length")}
                  >
                    <option value="medium">Coming soon</option>
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

            {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

            <div className="prose prose-sm dark:prose-invert max-w-none leading-relaxed">
              {showSkeleton ? (
                <div className="animate-pulse space-y-2" aria-live="polite" aria-busy="true">
                  <div className="h-4 w-3/5 bg-neutral-200 rounded" />
                  <div className="h-4 w-4/5 bg-neutral-200 rounded" />
                  <div className="h-4 w-2/3 bg-neutral-200 rounded" />
                  <div className="h-4 w-5/6 bg-neutral-200 rounded" />
                </div>
              ) : leadHtml || restParasHtml.length > 0 ? (
                <div className="whitespace-normal break-words">
                  {leadHtml && <div dangerouslySetInnerHTML={{ __html: leadHtml }} />}
                  {restParasHtml.map((h, idx) => (
                    <motion.div
                      dangerouslySetInnerHTML={{ __html: h }}
                      key={idx}
                      initial={{ opacity: 0, y: 6, filter: "blur(2px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      transition={{ duration: 0.28 }}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-neutral-500">生成結果がここに表示されます。</p>
              )}
            </div>

            {/* A1: 改善導線（出力直下 / 既存CTAの直前 / CTAトグルと独立） */}
            {!isLoading &&
              !error &&
              (leadHtml || restParasHtml.length > 0) &&
              dynamicA1.isOn && (
                <div
                  className="mt-4 rounded-xl border border-amber-200/70 bg-amber-50/60 px-4 py-3 select-none"
                  data-nosnippet
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 inline-flex size-8 items-center justify-center rounded-full bg-amber-500/15 text-amber-700">
                      <Zap className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-neutral-900">
                        💡 この文章は、もう少し良くできます
                      </p>

                      <p className="mt-1 text-[11px] leading-relaxed text-neutral-700">
                        <span className="font-medium">ヒント：</span>
                        次のどれか1つだけ追加でOKです
                      </p>

                      {/* 旧pointsは“軽い”補助として残す（最大2） */}
                      {thin.points.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {thin.points.map((line) => (
                            <p key={line} className="text-[11px] leading-relaxed text-neutral-700">
                              {line}
                            </p>
                          ))}
                        </div>
                      )}

                      {/* ✅ A1本丸：入力に応じた Top-1（最大1） */}
                      {a1HintItems.length > 0 && (
                        <div className="mt-2 space-y-1.5">
                          {a1HintItems.map((it, idx) => (
                            <p key={it.key} className="text-xs leading-relaxed text-neutral-800">
                              <span className="font-medium">ヒント{idx + 1}：</span>
                              {it.text}
                              {it.example ? (
                                <span className="text-neutral-600">（{it.example}）</span>
                              ) : null}
                            </p>
                          ))}
                        </div>
                      )}

                      <div className="mt-3">
                        <Button
                          type="button"
                          variant="secondary"
                          className="h-9 rounded-lg border border-amber-200 bg-white/80 text-xs font-semibold text-amber-900 hover:bg-white"
                          onClick={() => {
                            // ✅ A2: SSOT（A1ボタン直結）
                            setA2Open(true);
                            window.setTimeout(() => {
                              const el = a2PanelRef.current;
                              if (!el) return;
                              el.scrollIntoView({
                                behavior: prefersReduce ? "auto" : "smooth",
                                block: "start",
                              });
                            }, 0);
                          }}
                        >
                          商品情報を1分で補足する
                        </Button>
                      </div>

                      {/* console.debug("[A1] inferredReasons=", inferredReasons); */}
                    </div>
                  </div>
                </div>
              )}

            {/* A2: 簡易入力UI（A1表示中のみ / 出力直下 / CTAの直前） */}
            {a2CanShow && a2Open && (
              <div
                ref={a2PanelRef}
                className="mt-3 rounded-xl border border-amber-200/70 bg-white/80 px-4 py-3"
                data-nosnippet
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-neutral-900">補足入力（1分）</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-neutral-600">
                      ここで入力した内容は「適用して再生成」で反映されます（利用シーン→用途・目的／具体的な特徴→特徴・強み）。
                    </p>
                  </div>
                  <button
                    type="button"
                    className="inline-flex size-7 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
                    onClick={() => setA2Open(false)}
                    aria-label="閉じる"
                  >
                    ✕
                  </button>
                </div>

                {/* ✅ “禁止”ではなく“ヒント”（A2は固定の軽い注意でOK） */}
                <div className="mt-3 rounded-lg border border-amber-200/70 bg-amber-50/50 px-3 py-2">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 inline-flex size-6 items-center justify-center rounded-full bg-amber-500/15 text-amber-700">
                      <Info className="size-3.5" />
                    </span>
                    <p className="text-[11px] leading-relaxed text-neutral-700">
                      ※「丈夫」「魅力的」などの抽象語より、「数値」「仕様」「条件」を1つ（特徴・強みに）足すほうが効果的です
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid gap-3">
                  <div className="grid gap-1.5">
                    <Label className="text-[11px] font-semibold text-neutral-700">
                      利用シーン（用途・目的に追記）
                    </Label>
                    <Textarea
                      value={a2Scene}
                      onChange={(e) => setA2Scene(e.target.value)}
                      placeholder={`例：\nランチ前（11時台）\n雨の日の店頭\n在宅デスクでの作業中`}
                      className="min-h-[72px] resize-y rounded-lg text-xs leading-relaxed"
                    />
                  </div>

                  <div className="grid gap-1.5">
                    <Label className="text-[11px] font-semibold text-neutral-700">
                      具体的な特徴（特徴・強みに追記）
                    </Label>
                    <Textarea
                      value={a2Feature}
                      onChange={(e) => setA2Feature(e.target.value)}
                      placeholder={`例：\n最大1200px対応\n強化ガラス採用\n写真3枚まで掲載可能`}
                      className="min-h-[72px] resize-y rounded-lg text-xs leading-relaxed"
                    />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="h-9 rounded-lg text-xs"
                    onClick={a2ApplyAndRegenerate}
                  >
                    適用して再生成
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-9 rounded-lg text-xs"
                    onClick={() => setA2Open(false)}
                  >
                    閉じる
                  </Button>
                </div>
              </div>
            )}

            {ctaEnabled && (leadHtml || restParasHtml.length > 0) && !isLoading && !error && (
              <div className="mt-4 rounded-xl border border-indigo-200/70 bg-gradient-to-r from-indigo-50 to-violet-50 px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 inline-flex size-8 items-center justify-center rounded-full bg-indigo-600/15 text-indigo-700">
                    <Sparkles className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-neutral-900">
                      次のアクション（CTA）
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-neutral-700">
                      {(product ?? "").trim()
                        ? `『${(product ?? "").trim()}』が気になったら、まずは価格・在庫・返品条件をチェックして、迷った点は比較してから注文へ。`
                        : "気になったら、まずは価格・在庫・返品条件をチェックして、迷った点は比較してから注文へ。"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="inline-flex items-center rounded-full border bg-white/70 px-2.5 py-1 text-[11px] text-neutral-700">
                        ① 価格/在庫
                      </span>
                      <span className="inline-flex items-center rounded-full border bg-white/70 px-2.5 py-1 text-[11px] text-neutral-700">
                        ② 返品条件
                      </span>
                      <span className="inline-flex items-center rounded-full border bg-white/70 px-2.5 py-1 text-[11px] text-neutral-700">
                        ③ 迷ったら比較
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

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
                        initial={{ opacity: 0, y: 0, scale: 0.6, rotate: 0 }}
                        animate={{
                          opacity: [0, 1, 0],
                          y: -18,
                          scale: 1.1,
                          rotate: 20,
                        }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 1.2, delay, ease: "easeOut" }}
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