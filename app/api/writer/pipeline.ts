// app/api/writer/pipeline.ts
import { NextResponse } from "next/server";
import {
  sha256Hex,
  logEvent,
  emitWriterEvent,
} from "./_shared/logger";
import { createFinalProse } from "./openai-client";
import { resolveTonePresetKey, buildSystemPrompt } from "./tone-utils";
import type { ProductContext } from "@/server/products/repository";
import { logProductContextStatus } from "./logger";
import {
  buildPrecisionProductPayload,
  buildProductFactsDto,
} from "@/server/products/dto";
import * as DensityA from "@/lib/densityA";

/**
 * 設計方針:
 * - Pipeline は Normalize / Prose / Selection / Finalize の 4工程で扱う。
 * - 意味判断は AI 優先にし、機械は入力整形・API制御・ログ・最小外形チェックだけを担当する。
 * - scene / need / action / head relation / landing / plannerState の機械決定は行わない。
 * - proseUser は「最小外形 + 入力材料」の薄い handoff に限定する。
 * - finalize は意味非介入の整形だけに限定する。
 * - boundary fail は internal / 500 にせず、生成未成立として扱う。
 */

/* =========================
   Input / Result Types
========================= */

export type NormalizedInput = {
  product_name: string;
  category: string;
  goal: string;
  audience: string;
  platform?: string | null;
  keywords: string[];
  constraints: string[];
  brand_voice?: string | null;
  tone?: string | null;
  style?: string | null;
  length_hint?: string | null;
  selling_points: string[];
  objections: string[];
  evidence: string[];
  cta_preference: string[];
  _raw?: string;
  meta?: {
    template?: string | null;
    cta?: unknown;
  } | null;
};

export type WriterErrorReason =
  | "validation"
  | "content_policy"
  | "openai"
  | "openai_api_error"
  | "openai_empty_content"
  | "timeout"
  | "rate_limit"
  | "bad_request"
  | "boundary_failed"
  | "candidate_selection_failed"
  | "internal";

export type WriterPipelineError = {
  ok: false;
  reason: WriterErrorReason;
  message: string;
  code?: string;
  meta?: Record<string, unknown>;
};

export type WriterPipelineOk = {
  ok: true;
  ctx: WriterPipelineCtx;
  openai: {
    content: string;
    apiMs: number;
    status: number;
    statusText: string;
  };
};

export type WriterPipelineResult = WriterPipelineOk | WriterPipelineError;

export type CtaMode = "on" | "off";

export type CtaBlockContract = {
  heading: "おすすめのアクション";
  variants: readonly [
    "おすすめのアクション",
    "おすすめアクション",
    "おすすめの行動",
  ];
  placement: {
    atEnd: true;
    withinLastLines: 30;
  };
  bulletRules: {
    minBulletLines: 2;
  };
};

export type AtomicFactKind =
  | "PRODUCT_NAME"
  | "CATEGORY"
  | "AUDIENCE"
  | "SPEC"
  | "EVIDENCE"
  | "KEYWORD"
  | "CONSTRAINT";

export type AtomicFact = {
  id: string;
  kind: AtomicFactKind;
  text: string;
  required: boolean;
  source: "input";
  priority: number;
};

export type WriterPipelineCtx = {
  request: {
    requestId: string;
    route: "/api/writer";
    provider?: string;
    model?: string;
    temperature: number;
    t0: number;
  };
  input: {
    rawPrompt: string;
    normalized: NormalizedInput;
    productId?: string | null;
    productContext?: ProductContext | null;
    templateKey: string;
    isSNS: boolean;
    toneKey: string;
  };
  flags: {
    cta: {
      mode: CtaMode;
    };
  };
  contracts: {
    ctaBlock: CtaBlockContract;
  };
  facts: {
    items: AtomicFact[];
  };
  prompts: {
    proseSystem: string;
    proseUser: string;
    debug?: {
      proseSystemHash8: string;
      proseUserHash8: string;
    };
  };
  product: {
    precisionPayload: ReturnType<typeof buildPrecisionProductPayload>;
    productFacts: ReturnType<typeof buildProductFactsDto>;
    productFactsBlock: string | null;
  };
};

/* =========================
   Normalize Helpers
========================= */

function normalizeJaText(s: unknown): string {
  return (s ?? "").toString().replace(/\s+/g, " ").trim();
}

function uniqueNonEmptyStrings(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const value = normalizeJaText(item);
    if (!value) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function resolveTemplateKey(n: NormalizedInput): string {
  const metaTemplate = n.meta?.template;
  const raw = (metaTemplate ?? n.platform ?? "").toString().trim().toLowerCase();
  return raw || "lp";
}

function isSnsLikeTemplate(templateKey: string): boolean {
  return /sns/.test(templateKey) || /sns_short/.test(templateKey);
}

function parseBooleanLike(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") {
    if (v === 1) return true;
    if (v === 0) return false;
    return null;
  }
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["true", "1", "on", "yes", "y"].includes(s)) return true;
    if (["false", "0", "off", "no", "n"].includes(s)) return false;
  }
  return null;
}

function resolveCtaMode(n: NormalizedInput): CtaMode {
  const candidates = [n.meta?.cta, (n as any)?.metaCta, (n as any)?.ctaEnabled, (n as any)?.cta];
  for (const candidate of candidates) {
    const parsed = parseBooleanLike(candidate);
    if (parsed !== null) return parsed ? "on" : "off";
  }
  return "on";
}

function looksMojibakeLike(line: string): boolean {
  const s = (line ?? "").toString();
  if (!s) return false;
  if (s.includes("\uFFFD")) return true;
  if (/[繧繝]/.test(s)) return true;
  const hwKanaRuns = s.match(/[ｦ-ﾟ]{2,}/g);
  return Boolean(hwKanaRuns && hwKanaRuns.length > 0);
}

function buildInputText(normalized: NormalizedInput): string {
  return [
    normalized.product_name,
    normalized.category,
    normalized.goal,
    normalized.audience,
    ...uniqueNonEmptyStrings(normalized.selling_points),
    ...uniqueNonEmptyStrings(normalized.evidence),
    ...uniqueNonEmptyStrings(normalized.keywords),
    ...uniqueNonEmptyStrings(normalized.constraints),
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
}

function hasSubstantialProductDetailInput(normalized: NormalizedInput): boolean {
  return Boolean(
    normalizeJaText(normalized.product_name) ||
      normalizeJaText(normalized.category) ||
      normalizeJaText(normalized.audience) ||
      uniqueNonEmptyStrings(normalized.selling_points).length > 0 ||
      uniqueNonEmptyStrings(normalized.evidence).length > 0 ||
      uniqueNonEmptyStrings(normalized.keywords).length > 0 ||
      uniqueNonEmptyStrings(normalized.constraints).length > 0,
  );
}

type MinimalInputRescueTemplate = "lp" | "email" | "sns_short";

function resolveMinimalInputRescueTemplate(
  templateKey: string,
): MinimalInputRescueTemplate | null {
  const key = normalizeJaText(templateKey).toLowerCase();

  if (key === "lp" || /landing/.test(key)) return "lp";
  if (key.includes("email") || key.includes("mail")) return "email";
  if (key.includes("sns")) return "sns_short";

  return null;
}

function isMinimalInputRescueTarget(args: {
  normalized: NormalizedInput;
  templateKey: string;
  rawPrompt: string;
}): args is {
  normalized: NormalizedInput;
  templateKey: string;
  rawPrompt: string;
} {
  if (hasSubstantialProductDetailInput(args.normalized)) return false;
  if (!normalizeJaText(args.rawPrompt)) return false;
  return resolveMinimalInputRescueTemplate(args.templateKey) !== null;
}

function extractPromptTopic(rawPrompt: string): string {
  const prompt = normalizeJaText(rawPrompt);
  if (!prompt) return "";

  const topic = prompt
    .replace(/[「」『』【】]/g, "")
    .replace(
      /(?:LP|ランディングページ|メール|メルマガ|SNS|sns_short|sns|投稿文|紹介文|件名)\s*(?:用|向け)?/giu,
      "",
    )
    .replace(
      /(?:を|の)?(?:作成|制作|作る|生成|作って|書く|書いて|ください|下さい|お願いします|ほしい|欲しい)(?:[。.!！？?].*)?$/u,
      "",
    )
    .replace(/^(?:について|向けの|用の)\s*/u, "")
    .replace(/^[#＃:：\-\s]+/u, "")
    .replace(/[。.!！？?].*$/u, "")
    .trim();

  return topic.slice(0, 60);
}

function buildMinimalInputLpRescueText(rawPrompt: string): string {
  const topic = extractPromptTopic(rawPrompt);
  const headline = topic ? `# ${topic}` : "# ランディングページ用コピー";

  return [
    headline,
    "",
    "導入メリットを短く伝え、特徴と行動導線をひと目で追いやすくしたLP向けのたたき台です。",
    "",
    "・特徴を短く整理して伝えます",
    "・使う場面や価値を読み取りやすくまとめます",
    "・お問い合わせや詳細確認につながる導線を最後に置きます",
    "",
    "お問い合わせはこちら",
  ].join("\n");
}

function buildMinimalInputEmailRescueText(rawPrompt: string): string {
  const topic = extractPromptTopic(rawPrompt);
  const subject = topic ? `${topic}のご案内` : "ご案内";

  return [
    `件名: ${subject}`,
    "",
    topic
      ? `${topic}について、要点を短く確認しやすいメール下書きです。`
      : "要点を短く確認しやすいメール下書きです。",
    "詳細が固まり次第、そのまま本文へ追記しやすい最小構成にしています。",
    "",
    "・冒頭で伝えたい内容を短く示します",
    "・必要な情報を順番に確認しやすく並べます",
    "・最後に返信や確認の導線を置きます",
  ].join("\n");
}

function buildMinimalInputSnsShortRescueText(rawPrompt: string): string {
  const topic = extractPromptTopic(rawPrompt);

  return [
    topic
      ? `${topic}の要点を短くまとめたSNS向けの下書きです。`
      : "SNS向けの短い下書きです。",
    "詳細が固まり次第、そのまま投稿文へ言い回しを足しやすい形にしています。",
    "",
    "・要点を短く伝えます",
    "・読み手が流れを追いやすく整えます",
    "・詳しい案内への導線を後ろに置けます",
  ].join("\n");
}

function buildMinimalInputRescueText(args: {
  templateKey: string;
  rawPrompt: string;
}): string {
  const rescueTemplate = resolveMinimalInputRescueTemplate(args.templateKey);

  switch (rescueTemplate) {
    case "lp":
      return buildMinimalInputLpRescueText(args.rawPrompt);
    case "email":
      return buildMinimalInputEmailRescueText(args.rawPrompt);
    case "sns_short":
      return buildMinimalInputSnsShortRescueText(args.rawPrompt);
    default:
      return buildMinimalInputLpRescueText(args.rawPrompt);
  }
}

const UNIT_OR_NUMBER_RE =
  /[0-9０-９]+|%|％|mm|cm|m|g|kg|mg|ml|mL|l|L|W|w|V|v|Hz|kHz|lm|ルーメン|インチ|時間|分|秒|年|回|段階/;
const SPEC_MARKER_RE = /(LED|USB|Type-?C|Bluetooth|Wi-?Fi|可動|調整|角度|高さ|明るさ)/;

function classifySellingPoints(points: string[]): {
  facts: string[];
  optional: string[];
} {
  const facts: string[] = [];
  const optional: string[] = [];

  for (const point of uniqueNonEmptyStrings(points)) {
    if (looksMojibakeLike(point)) {
      optional.push(point);
      continue;
    }

    if (UNIT_OR_NUMBER_RE.test(point) || SPEC_MARKER_RE.test(point)) {
      facts.push(point);
      continue;
    }

    optional.push(point);
  }

  return { facts, optional };
}

function normalizedForDensityA(normalized: NormalizedInput): NormalizedInput {
  const source = uniqueNonEmptyStrings(normalized.selling_points ?? []);
  if (source.length === 0) {
    return { ...normalized, selling_points: [] };
  }

  const classified = classifySellingPoints(source);
  const picked = classified.facts[0] ?? source[0];

  return {
    ...normalized,
    selling_points: picked ? [picked] : [],
  };
}

function buildCtaBlockContract(): CtaBlockContract {
  return {
    heading: "おすすめのアクション",
    variants: ["おすすめのアクション", "おすすめアクション", "おすすめの行動"],
    placement: { atEnd: true, withinLastLines: 30 },
    bulletRules: { minBulletLines: 2 },
  } as const;
}

/* =========================
   Atomic Facts
========================= */

function pushAtomicFact(
  out: AtomicFact[],
  seen: Set<string>,
  fact: Omit<AtomicFact, "id">,
) {
  const text = normalizeJaText(fact.text);
  if (!text) return;

  const dedupeKey = `${fact.kind}:${text}`;
  if (seen.has(dedupeKey)) return;
  seen.add(dedupeKey);

  out.push({
    id: `fact_${out.length + 1}`,
    ...fact,
    text,
  });
}

export function buildAtomicFacts(normalized: NormalizedInput): AtomicFact[] {
  const facts: AtomicFact[] = [];
  const seen = new Set<string>();

  pushAtomicFact(facts, seen, {
    kind: "PRODUCT_NAME",
    text: normalized.product_name,
    required: true,
    source: "input",
    priority: 100,
  });

  pushAtomicFact(facts, seen, {
    kind: "CATEGORY",
    text: normalized.category,
    required: false,
    source: "input",
    priority: 50,
  });

  pushAtomicFact(facts, seen, {
    kind: "AUDIENCE",
    text: normalized.audience,
    required: false,
    source: "input",
    priority: 90,
  });

  for (const text of uniqueNonEmptyStrings([...normalized.selling_points, ...normalized.evidence])) {
    pushAtomicFact(facts, seen, {
      kind: UNIT_OR_NUMBER_RE.test(text) || SPEC_MARKER_RE.test(text) ? "SPEC" : "EVIDENCE",
      text,
      required: false,
      source: "input",
      priority: UNIT_OR_NUMBER_RE.test(text) || SPEC_MARKER_RE.test(text) ? 80 : 70,
    });
  }

  for (const text of uniqueNonEmptyStrings(normalized.keywords)) {
    pushAtomicFact(facts, seen, {
      kind: "KEYWORD",
      text,
      required: false,
      source: "input",
      priority: 40,
    });
  }

  for (const text of uniqueNonEmptyStrings(normalized.constraints)) {
    pushAtomicFact(facts, seen, {
      kind: "CONSTRAINT",
      text,
      required: false,
      source: "input",
      priority: 45,
    });
  }

  return facts.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}

export function pickPrimaryFactByKind(
  facts: AtomicFact[],
  kind: AtomicFactKind,
): AtomicFact | null {
  return facts.find((fact) => fact.kind === kind) ?? null;
}

function filterFactsByKind(facts: AtomicFact[], kind: AtomicFactKind): AtomicFact[] {
  return facts.filter((fact) => fact.kind === kind);
}

function uniqueFacts(facts: Array<AtomicFact | null | undefined>): AtomicFact[] {
  const out: AtomicFact[] = [];
  const seen = new Set<string>();

  for (const fact of facts) {
    if (!fact) continue;
    if (seen.has(fact.id)) continue;
    seen.add(fact.id);
    out.push(fact);
  }

  return out;
}

function buildUsableFactsForRenderer(facts: AtomicFact[]): AtomicFact[] {
  const productFact = pickPrimaryFactByKind(facts, "PRODUCT_NAME");
  const categoryFact = pickPrimaryFactByKind(facts, "CATEGORY");
  const audienceFact = pickPrimaryFactByKind(facts, "AUDIENCE");
  const specFacts = filterFactsByKind(facts, "SPEC");
  const evidenceFacts = filterFactsByKind(facts, "EVIDENCE");
  const keywordFacts = filterFactsByKind(facts, "KEYWORD");
  const constraintFacts = filterFactsByKind(facts, "CONSTRAINT");

  return uniqueFacts([
    productFact,
    categoryFact,
    audienceFact,
    specFacts[0],
    evidenceFacts[0],
    specFacts[1],
    evidenceFacts[1],
    keywordFacts[0],
    constraintFacts[0],
  ]).slice(0, 8);
}

/* =========================
   Prose Prompt
========================= */

function buildProseSystem(args: {
  toneKey: string;
  isSNS: boolean;
}): string {
  const baseSystem = buildSystemPrompt({
    toneKey: args.toneKey,
    overrides: undefined,
  } as any);

  const systemLines = [
    "あなたはEC向けの商品紹介文を書くライターです。出力は日本語の本文のみです。",
    "自然な日本語を最優先してください。説明くささや、型どおりに埋める感じを避けてください。",
    "意味判断は入力からあなたが行ってください。機械側の分類名や推定ラベルは本文に持ち込まないでください。",
    "入力にない具体値や比較優位は足さないでください。",
    "英字の項目名や変数名は本文に出さないでください。",
    "見出し、FAQ、自己評価、注釈は出さないでください。",
  ];

  if (args.isSNS) {
    systemLines.push("SNS向けであっても、不自然な省略や過度な煽りは避けてください。");
  }

  return [baseSystem, systemLines.join("\n")].join("\n\n");
}

function buildHeadFirstHardFloorBlock(args: {
  productName: string;
}): string[] {
  const lines = [
    "出力はヘッド2文のあとに箇条書き3点です。",
    "1文目を書き終えてから2文目へ進み、2文目を書いたらヘッドを閉じてください。",
  ];

  if (args.productName) {
    lines.push(`1文目は、必ず「${args.productName}」から書き始めてください。商品名より前に別の語を置かないでください。`);
  } else {
    lines.push("1文目は、必ず商品名から書き始めてください。商品名より前に別の語を置かないでください。");
  }

  lines.push("1文目は1文だけで止め、句点で閉じてください。1文目の中で内容を詰め込みすぎないでください。");
  lines.push("2文目は1文目の続きとして自然に読める1文にしてください。1文目の言い換えや抽象的な総評だけで閉じないでください。");

  return lines;
}

function buildMinimalSceneHandoffBlock(): string[] {
  return [
    "入力を読んで、2〜3秒の自然な使用場面を頭の中で1つだけ選んでください。",
    "その場面の意味づけや焦点化は、入力からあなたが判断してください。機械側で scene / need / action は決めません。",
    "1文目では、その場面への入口を自然に書いてください。",
    "2文目では、その入口の続きとして、次に起きることを自然な1文で書いてください。",
  ];
}

function buildBodyShapeBlock(): string[] {
  return [
    "箇条書きは3点だけにしてください。",
    "箇条書き3点は、同じ内容の言い換えを避けてください。",
    "箇条書きでは、入力にある情報だけを使って具体的に書いてください。",
  ];
}

function buildMinimalSafetyLines(): string[] {
  return [
    "商品名は原文のまま書いてください。",
    "入力にない具体値は足さないでください。",
    "英字の項目名や変数名は本文に出さないでください。",
    "プレースホルダーや内部用ラベルを本文に出さないでください。",
  ];
}

function buildShapeRescueLines(): string[] {
  return [
    "shape rescue: 内容の意味は変えず、出力の外形だけ立て直してください。",
    "shape rescue: 1文目は商品名から始まる1文だけを書いてください。",
    "shape rescue: 2文目は1文目の続きとなる1文だけを書いてください。",
    "shape rescue: そのあと箇条書き3点だけを書いてください。",
  ];
}

function buildShapeRescueUserMessage(baseUser: string): string {
  return [baseUser, "", ...buildShapeRescueLines()].join("\n");
}

function buildPromptContextBlock(args: {
  normalized: NormalizedInput;
  usableFacts: AtomicFact[];
}): string[] {
  const lines: string[] = [];

  const productName = normalizeJaText(args.normalized.product_name);
  const category = normalizeJaText(args.normalized.category);
  const audience = normalizeJaText(args.normalized.audience);
  const goal = normalizeJaText(args.normalized.goal);

  if (productName) lines.push(`商品名: ${productName}`);
  if (category) lines.push(`カテゴリ: ${category}`);
  if (audience) lines.push(`想定読者: ${audience}`);
  if (goal) lines.push(`入力ゴール: ${goal}`);

  const materialFacts = uniqueNonEmptyStrings(
    args.usableFacts
      .filter((fact) =>
        ["SPEC", "EVIDENCE", "KEYWORD", "CONSTRAINT"].includes(fact.kind),
      )
      .map((fact) => fact.text),
  ).slice(0, 6);

  if (materialFacts.length > 0) {
    lines.push("使ってよい材料:");
    for (const value of materialFacts) {
      lines.push(`- ${value}`);
    }
    lines.push("上の材料は本文にそのまま貼らず、自然な日本語にほどいて使ってください。");
  }

  return lines;
}

type CandidateDiversityHint =
  | "goal_first"
  | "scene_first"
  | "feature_to_scene";

function resolveCandidateDiversityHint(
  candidateIndex: number,
): CandidateDiversityHint {
  switch (candidateIndex) {
    case 0:
      return "goal_first";
    case 1:
      return "scene_first";
    default:
      return "feature_to_scene";
  }
}

function buildCandidateDiversityLines(
  diversityHint: CandidateDiversityHint,
): string[] {
  switch (diversityHint) {
    case "goal_first":
      return [
        "この候補では、入力ゴールへの整合を最優先してください。",
        "何をしやすくしたいか、何を変えたいかが本文の早い位置で自然に読めるようにしてください。",
        "ただし目的説明だけで閉じず、短い使用場面にも自然に着地してください。",
      ];
    case "scene_first":
      return [
        "この候補では、2〜3秒の短い使用場面を先に自然に立ち上げてください。",
        "手に取る瞬間や置く場面、使い始める流れが先に浮かび、そのあと使いやすさや意味につながるようにしてください。",
      ];
    case "feature_to_scene":
      return [
        "この候補では、扱いやすさや特徴を入口にしてかまいません。",
        "ただし特徴説明だけで止めず、その特徴がどんな場面で役に立つかへ自然につなげてください。",
      ];
  }
}

function buildProseUser(args: {
  normalized: NormalizedInput;
  usableFacts: AtomicFact[];
  diversityHint: CandidateDiversityHint;
}): string {
  const productName = normalizeJaText(args.normalized.product_name);

  const promptLines = [
    ...buildHeadFirstHardFloorBlock({ productName }),
    ...buildMinimalSceneHandoffBlock(),
    ...buildBodyShapeBlock(),
    ...buildMinimalSafetyLines(),
    ...buildCandidateDiversityLines(args.diversityHint),
    ...buildPromptContextBlock(args),
  ];

  return promptLines.join("\n");
}

/* =========================
   Text Structure Helpers
========================= */

function splitHeadAndBody(text: string): { head: string; body: string } {
  const t = (text ?? "").toString().replace(/\r\n/g, "\n").trim();
  if (!t) return { head: "", body: "" };

  const idxBullet = t.search(/(^|\n)\s*[・\-]/m);
  if (idxBullet >= 0) {
    return {
      head: t.slice(0, idxBullet).trim(),
      body: t.slice(idxBullet).trim(),
    };
  }

  return { head: t, body: "" };
}

function splitJapaneseSentences(text: string): string[] {
  const t = (text ?? "").toString().replace(/\r\n/g, "\n").trim();
  if (!t) return [];

  return t
    .split(/[。！？!?]\s*|\n+/)
    .map((part) => part.replace(/^[・\-]\s*/, "").trim())
    .filter(Boolean);
}

function countHeadSentences(head: string): number {
  return splitJapaneseSentences(head).length;
}

function extractHeadSentences(head: string): [string, string] {
  const sentences = splitJapaneseSentences(head);
  return [sentences[0] ?? "", sentences[1] ?? ""];
}

function collectBulletLines(body: string): string[] {
  const t = (body ?? "").toString().replace(/\r\n/g, "\n").trim();
  if (!t) return [];

  return t
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /^[・\-]\s*/.test(line));
}

/* =========================
   Boundary / Safety Helpers
========================= */

function extractSpecTokens(text: string): string[] {
  const tokens: string[] = [];
  const seen = new Set<string>();

  const push = (value: string) => {
    const token = (value ?? "").toString().trim();
    if (!token || seen.has(token)) return;
    seen.add(token);
    tokens.push(token);
  };

  for (const match of text.match(/(?:[0-9０-９]{1,6})(?:\s*(?:%|％|mm|cm|m|g|kg|mg|ml|mL|l|L|W|w|V|v|Hz|kHz|lm|ルーメン|インチ|時間|分|秒|年|回|段階))?/g) ?? []) {
    push(match);
  }
  for (const match of text.match(/(?:LED|USB|Type-?C|Bluetooth|Wi-?Fi|可動|調整|角度|高さ|明るさ)/g) ?? []) {
    push(match);
  }

  return tokens;
}

function hasSpecInflation(outputText: string, normalized: NormalizedInput): boolean {
  const inputTokens = new Set(extractSpecTokens(buildInputText(normalized)));
  const outputTokens = extractSpecTokens(outputText);

  for (const token of outputTokens) {
    if (inputTokens.has(token)) continue;
    const digitsOnly = token.replace(/[^\d０-９]/g, "");
    if (digitsOnly) {
      const sameDigits = Array.from(inputTokens).some(
        (inputToken) => inputToken.replace(/[^\d０-９]/g, "") === digitsOnly,
      );
      if (sameDigits && digitsOnly === token) continue;
    }
    return true;
  }

  return false;
}

function hasUnsupportedStrongAssertion(text: string): boolean {
  const t = (text ?? "").toString();
  if (!t) return false;
  if (/(100%|１００％|No\.?1|Ｎｏ\.?１|業界初|永久|絶対|完璧)/.test(t)) return true;

  const sentences = splitJapaneseSentences(t);
  return sentences.some((sentence) => /^(?:[・\-]\s*)?(必ず|確実)\b/.test(sentence));
}

function hasRepeatedSentenceEnding(text: string): boolean {
  const { head } = splitHeadAndBody(text);
  const sentences = splitJapaneseSentences(head);
  let prev = "";
  let streak = 1;

  const pickEnding = (sentence: string): string => {
    const s = sentence.trim();
    const match = s.match(/(です|ます|します|しました|でした|でしょう|できます|ない|ません)$/);
    if (match?.[1]) return match[1];
    return s.slice(Math.max(0, s.length - 4));
  };

  for (const sentence of sentences) {
    if (sentence.length <= 3) continue;
    const ending = pickEnding(sentence);
    if (!ending) continue;
    if (prev && ending === prev) {
      streak += 1;
      if (streak >= 2) return true;
    } else {
      prev = ending;
      streak = 1;
    }
  }

  return false;
}

const PLACEHOLDER_LEAK_PATTERNS: Array<{ token: string; re: RegExp }> = [
  { token: "product_name", re: /\bproduct_name\b/i },
  { token: "audience", re: /\baudience\b/i },
  { token: "goal_need", re: /\bgoal_need\b/i },
  { token: "goal_scene", re: /\bgoal_scene\b/i },
  { token: "goal_action", re: /\bgoal_action\b/i },
  { token: "role_materials", re: /\brole_materials\b/i },
  { token: "source_guard", re: /\bsource_guard\b/i },
  { token: "reference_head_plan", re: /\breference_head_plan\b/i },
  { token: "selected_facts", re: /\bselected_facts\b/i },
  { token: "micro_scene_plan", re: /\bmicro_scene_plan\b/i },
  { token: "writing_materials", re: /\bwriting_materials\b/i },
  { token: "writing_contract", re: /\bwriting_contract\b/i },
];

function detectPlaceholderLeakage(text: string): string[] {
  const value = (text ?? "").toString();
  if (!value) return [];

  const hits: string[] = [];
  for (const item of PLACEHOLDER_LEAK_PATTERNS) {
    if (item.re.test(value)) hits.push(item.token);
  }
  return hits;
}

export type FinalProseBoundaryResult = {
  ok: boolean;
  reasons: string[];
  score: number;
  warnings: string[];
};

function buildBoundaryWarnings(text: string, normalized: NormalizedInput): string[] {
  const warnings: string[] = [];

  if (hasSpecInflation(text, normalized)) {
    warnings.push("SPEC_INFLATION");
  }

  if (hasUnsupportedStrongAssertion(text)) {
    warnings.push("UNSUPPORTED_STRONG_ASSERTION");
  }

  if (hasRepeatedSentenceEnding(text)) {
    warnings.push("REPEATED_SENTENCE_ENDING");
  }

  return warnings;
}

function normalizeBoundaryMatchText(text: string): string {
  return (text ?? "")
    .toString()
    .replace(/\s+/g, "")
    .replace(/[、。・\-‐‑‒–—―,:：;；!?！？()（）「」『』【】\[\]{}]/g, "")
    .trim();
}

function countNormalizedOccurrences(haystack: string, needle: string): number {
  const source = normalizeBoundaryMatchText(haystack);
  const target = normalizeBoundaryMatchText(needle);
  if (!source || !target) return 0;

  let count = 0;
  let index = 0;
  while (true) {
    const found = source.indexOf(target, index);
    if (found < 0) break;
    count += 1;
    index = found + target.length;
  }

  return count;
}

function collectRestatementSourceFragments(normalized: NormalizedInput): string[] {
  return uniqueNonEmptyStrings([
    normalized.goal,
    ...normalized.selling_points,
    ...normalized.evidence,
    ...normalized.keywords,
    ...normalized.constraints,
  ]).filter((value) => normalizeBoundaryMatchText(value).length >= 8);
}

function hasSourceRestatement(textPart: string, normalized: NormalizedInput): boolean {
  const target = normalizeBoundaryMatchText(textPart);
  if (!target) return false;

  return collectRestatementSourceFragments(normalized).some((fragment) => {
    const source = normalizeBoundaryMatchText(fragment);
    return source.length >= 8 && target.includes(source);
  });
}

function extractGoalAnchorFragments(goal: string, normalized: NormalizedInput): string[] {
  const productName = normalizeBoundaryMatchText(normalized.product_name);
  const audience = normalizeBoundaryMatchText(normalized.audience);

  const rawFragments =
    normalizeJaText(goal).match(
      /(?:[一-龠々]{1,6}(?:[ぁ-ん]{0,4})?|[ァ-ヶー]{2,}|[A-Za-z0-9]{2,})/g,
    ) ?? [];

  return uniqueNonEmptyStrings(rawFragments)
    .map((fragment) => normalizeJaText(fragment))
    .filter((fragment) => {
      const token = normalizeBoundaryMatchText(fragment);
      if (token.length < 2) return false;
      if (productName && token === productName) return false;
      if (audience && token === audience) return false;
      return true;
    })
    .sort(
      (a, b) =>
        normalizeBoundaryMatchText(b).length - normalizeBoundaryMatchText(a).length,
    );
}

function hasPurposeMisalignment(text: string, normalized: NormalizedInput): boolean {
  const goal = normalizeJaText(normalized.goal);
  if (!goal) return false;

  const target = normalizeBoundaryMatchText(text);
  if (!target) return false;

  const goalAnchors = extractGoalAnchorFragments(goal, normalized);
  if (goalAnchors.length === 0) return false;

  const matchedAnchors = goalAnchors.filter((anchor) =>
    target.includes(normalizeBoundaryMatchText(anchor)),
  );

  if (matchedAnchors.length === 0) return true;

  const longestAnchor = goalAnchors[0];
  const longestAnchorMatched = target.includes(
    normalizeBoundaryMatchText(longestAnchor),
  );
  const requiredMatchedCount = Math.min(2, goalAnchors.length);

  return !longestAnchorMatched && matchedAnchors.length < requiredMatchedCount;
}

const ABSTRACT_PROMOTION_PATTERNS = [
  /(?:おすすめ|ぴったり|最適|理想的|理想の|ワンランク上|上質な体験)/,
  /(?:毎日|暮らし|生活|日常|時間|気分|ひととき).{0,12}(?:変える|変わる|整う|支える|叶える|かなえる|豊か|快適|上質|便利)/,
  /(?:価値|魅力|良さ|良いところ).{0,10}(?:広がる|高まる|深まる)/,
];

function hasHeadAbstractPromotion(head: string): boolean {
  const value = normalizeJaText(head);
  if (!value) return false;
  return ABSTRACT_PROMOTION_PATTERNS.some((pattern) => pattern.test(value));
}

function hasAudiencePlacementViolation(head: string, body: string, normalized: NormalizedInput): boolean {
  const audience = normalizeJaText(normalized.audience);
  if (!audience) return false;

  const headCount = countNormalizedOccurrences(head, audience);
  const bodyCount = countNormalizedOccurrences(body, audience);

  return headCount !== 1 || bodyCount > 0;
}

function evaluateCandidateSelectionBoundary(
  text: string,
  normalized: NormalizedInput,
): FinalProseBoundaryResult {
  const reasons: string[] = [];
  const warnings = buildBoundaryWarnings(text, normalized);

  const { head, body } = splitHeadAndBody(text);
  const [head1] = extractHeadSentences(head);
  const headSentences = countHeadSentences(head);
  const bulletLines = collectBulletLines(body);
  const productName = normalizeJaText(normalized.product_name);
  const placeholderLeakageHits = detectPlaceholderLeakage(text);

  if (headSentences !== 2) {
    reasons.push("HEAD_SENTENCE_COUNT");
  }

  if (bulletLines.length !== 3) {
    reasons.push("BULLET_COUNT");
  }

  if (!productName || !head1.includes(productName)) {
    reasons.push("HEAD1_MISSING_PRODUCT_NAME");
  }

  if (placeholderLeakageHits.length > 0) {
    reasons.push("PLACEHOLDER_LEAKAGE");
  }

  const score = Math.max(0, 100 - reasons.length * 25 - warnings.length * 5);

  return {
    ok: reasons.length === 0,
    reasons,
    score,
    warnings,
  };
}

export function evaluateFinalProseBoundary(
  text: string,
  normalized: NormalizedInput,
): FinalProseBoundaryResult {
  const base = evaluateCandidateSelectionBoundary(text, normalized);
  const reasons = [...base.reasons];

  const { head, body } = splitHeadAndBody(text);

  if (hasHeadAbstractPromotion(head)) {
    reasons.push("HEAD_ABSTRACT_PROMOTION");
  }

  if (hasPurposeMisalignment(text, normalized)) {
    reasons.push("PURPOSE_NOT_ALIGNED");
  }

  if (hasSourceRestatement(head, normalized)) {
    reasons.push("HEAD_SOURCE_RESTATEMENT");
  }

  if (hasSourceRestatement(body, normalized)) {
    reasons.push("BODY_SOURCE_RESTATEMENT");
  }

  if (hasAudiencePlacementViolation(head, body, normalized)) {
    reasons.push("AUDIENCE_NOT_EXACT_ONCE_IN_HEAD");
  }

  const uniqueReasons = Array.from(new Set(reasons));
  const score = Math.max(0, 100 - uniqueReasons.length * 25 - base.warnings.length * 5);

  return {
    ok: uniqueReasons.length === 0,
    reasons: uniqueReasons,
    score,
    warnings: base.warnings,
  };
}

/* =========================
   Finalize Helpers
========================= */

function normalizeBulletMarkers(text: string): { text: string; changed: boolean } {
  const raw = (text ?? "").toString().replace(/\r\n/g, "\n");
  const next = raw
    .split("\n")
    .map((line) => {
      if (/^\s*-\s+/.test(line)) {
        return line.replace(/^\s*-\s+/, "・ ");
      }
      return line.replace(/[ \t]+$/g, "");
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    text: next,
    changed: next !== raw.trim(),
  };
}

function safeFinalReplace(text: string): { text: string; didRepair: boolean; keys: string[] } {
  const raw = (text ?? "").toString();
  if (!raw) return { text: raw, didRepair: false, keys: [] };

  let t = raw;
  const keys: string[] = [];
  const apply = (re: RegExp, to: string, key: string) => {
    const before = t;
    t = t.replace(re, to);
    if (t !== before) keys.push(key);
  };

  apply(/、\s*、/g, "、", "FINAL_REPAIR_DOUBLE_COMMA");
  apply(/。\s*。/g, "。", "FINAL_REPAIR_DOUBLE_MARU");
  apply(/[！!]{2,}/g, "！", "FINAL_REPAIR_MULTI_EXCLAMATION");
  apply(/[？?]{2,}/g, "？", "FINAL_REPAIR_MULTI_QUESTION");

  return { text: t, didRepair: keys.length > 0, keys };
}

function finalizeResponseText(selectedText: string): {
  text: string;
  changed: boolean;
  repairKeys: string[];
} {
  const normalized = normalizeBulletMarkers(selectedText);
  const safeReplace = safeFinalReplace(normalized.text);
  const finalText = safeReplace.text;

  return {
    text: finalText,
    changed: finalText !== selectedText,
    repairKeys: safeReplace.keys,
  };
}

/* =========================
   densityA Helpers
========================= */

function tryComputeDensityA(normalized: NormalizedInput, outputText: string): {
  densityA: number | null;
  inputCount: number | null;
  usedCount: number | null;
} {
  try {
    const fn = (DensityA as any)?.evaluateDensityA;
    if (typeof fn !== "function") {
      return { densityA: null, inputCount: null, usedCount: null };
    }

    const densNorm = normalizedForDensityA(normalized);
    const result = fn(densNorm, outputText);

    return {
      densityA: typeof result?.densityA === "number" ? result.densityA : null,
      inputCount: Array.isArray(result?.inputSet) ? result.inputSet.length : null,
      usedCount: Array.isArray(result?.usedSet) ? result.usedSet.length : null,
    };
  } catch {
    return { densityA: null, inputCount: null, usedCount: null };
  }
}

function observeDensityA(args: {
  normalized: NormalizedInput;
  outputText: string;
  requestId: string;
  provider?: string;
  model?: string;
  templateKey: string;
  isSNS: boolean;
  ctaMode: CtaMode;
  hasProductFacts: boolean;
}) {
  const dens = tryComputeDensityA(args.normalized, args.outputText);
  const event = {
    phase: "pipeline_densityA" as const,
    level: "DEBUG",
    route: "/api/writer",
    message: "densityA observed",
    requestId: args.requestId,
    provider: args.provider,
    model: args.model,
    templateKey: args.templateKey,
    isSNS: args.isSNS,
    ctaMode: args.ctaMode,
    hasProductFacts: args.hasProductFacts,
    densityA: dens.densityA,
    inputCount: dens.inputCount,
    usedCount: dens.usedCount,
  };
  logEvent("ok", event);
}

/* =========================
   Candidate Helpers
========================= */

type CandidatePassKind = "initial";

type CandidateRecord = {
  passKind: CandidatePassKind;
  candidateIndex: number;
  diversityHint: CandidateDiversityHint;
  content: string;
  apiMs: number;
  status: number;
  statusText: string;
  minimalBoundary: FinalProseBoundaryResult;
  richerBoundary: FinalProseBoundaryResult;
  proseUser: string;
};

type CandidateBatchResult = {
  candidates: CandidateRecord[];
  passedCandidates: CandidateRecord[];
};

type CandidateAiJudgeDecisionMark = "best" | "tie" | "override";

type CandidateAiJudgeDecision = {
  goalAlignment: CandidateAiJudgeDecisionMark;
  naturalJapanese: CandidateAiJudgeDecisionMark;
  sceneConcreteness: CandidateAiJudgeDecisionMark;
  restatementPenaltyUsed: boolean;
  overrideUsed: boolean;
};

type CandidateAiJudgeRejected = {
  candidateIndex: number;
  mainReason: string;
};

type CandidateAiJudgeResult = {
  ok: boolean;
  selectedCandidateIndex: number | null;
  reason: string;
  raw: string;
  decision: CandidateAiJudgeDecision | null;
  rejected: CandidateAiJudgeRejected[];
  errorKind?:
    | "openai_error"
    | "empty"
    | "invalid_json"
    | "invalid_index"
    | "invalid_decision";
};

function collectMinimalPassedCandidates(
  candidates: CandidateRecord[],
): CandidateRecord[] {
  return candidates.filter((candidate) => candidate.minimalBoundary.ok);
}

function compareDiagnosticCandidates(
  current: CandidateRecord | null,
  next: CandidateRecord,
): CandidateRecord {
  if (!current) return next;

  if (next.minimalBoundary.reasons.length !== current.minimalBoundary.reasons.length) {
    return next.minimalBoundary.reasons.length < current.minimalBoundary.reasons.length
      ? next
      : current;
  }

  if (next.minimalBoundary.warnings.length !== current.minimalBoundary.warnings.length) {
    return next.minimalBoundary.warnings.length < current.minimalBoundary.warnings.length
      ? next
      : current;
  }

  if (next.minimalBoundary.score !== current.minimalBoundary.score) {
    return next.minimalBoundary.score > current.minimalBoundary.score ? next : current;
  }

  return next.candidateIndex < current.candidateIndex ? next : current;
}

function selectBestDiagnosticCandidate(
  candidates: CandidateRecord[],
): CandidateRecord | null {
  let best: CandidateRecord | null = null;

  for (const candidate of candidates) {
    best = compareDiagnosticCandidates(best, candidate);
  }

  return best;
}

function compareFallbackCandidates(
  current: CandidateRecord | null,
  next: CandidateRecord,
): CandidateRecord {
  if (!current) return next;

  if (next.richerBoundary.ok !== current.richerBoundary.ok) {
    return next.richerBoundary.ok ? next : current;
  }

  if (next.richerBoundary.reasons.length !== current.richerBoundary.reasons.length) {
    return next.richerBoundary.reasons.length < current.richerBoundary.reasons.length
      ? next
      : current;
  }

  if (next.richerBoundary.warnings.length !== current.richerBoundary.warnings.length) {
    return next.richerBoundary.warnings.length < current.richerBoundary.warnings.length
      ? next
      : current;
  }

  if (next.richerBoundary.score !== current.richerBoundary.score) {
    return next.richerBoundary.score > current.richerBoundary.score ? next : current;
  }

  if (next.minimalBoundary.reasons.length !== current.minimalBoundary.reasons.length) {
    return next.minimalBoundary.reasons.length < current.minimalBoundary.reasons.length
      ? next
      : current;
  }

  if (next.minimalBoundary.warnings.length !== current.minimalBoundary.warnings.length) {
    return next.minimalBoundary.warnings.length < current.minimalBoundary.warnings.length
      ? next
      : current;
  }

  if (next.minimalBoundary.score !== current.minimalBoundary.score) {
    return next.minimalBoundary.score > current.minimalBoundary.score ? next : current;
  }

  return next.candidateIndex < current.candidateIndex ? next : current;
}

function selectFallbackCandidate(
  candidates: CandidateRecord[],
): CandidateRecord | null {
  let best: CandidateRecord | null = null;

  for (const candidate of candidates) {
    best = compareFallbackCandidates(best, candidate);
  }

  return best;
}

function selectBestAlternativeCandidate(
  candidates: CandidateRecord[],
  selectedCandidateIndex: number,
): CandidateRecord | null {
  return selectFallbackCandidate(
    candidates.filter((candidate) => candidate.candidateIndex !== selectedCandidateIndex),
  );
}

function candidateHasRicherReason(candidate: CandidateRecord, reason: string): boolean {
  return candidate.richerBoundary.reasons.includes(reason);
}

function candidateHasRicherWarning(candidate: CandidateRecord, warning: string): boolean {
  return candidate.richerBoundary.warnings.includes(warning);
}

function hasNonEmptyJudgeReason(reason: string): boolean {
  return normalizeJaText(reason).length > 0;
}

function hasStructuredRejectedCandidates(rejected: CandidateAiJudgeRejected[]): boolean {
  return (
    rejected.length > 0 &&
    rejected.every(
      (item) =>
        Number.isFinite(item.candidateIndex) && normalizeJaText(item.mainReason).length > 0,
    )
  );
}

function validateAiJudgeSelection(args: {
  candidates: CandidateRecord[];
  selectedCandidate: CandidateRecord;
  decision: CandidateAiJudgeDecision;
  rejected: CandidateAiJudgeRejected[];
  reason: string;
}): { ok: boolean; message?: string; meta?: Record<string, unknown> } {
  const strongerAlternatives = args.candidates.filter(
    (candidate) =>
      candidate.candidateIndex !== args.selectedCandidate.candidateIndex &&
      candidate.richerBoundary.score > args.selectedCandidate.richerBoundary.score,
  );

  const selectedHasPurposePenalty = candidateHasRicherReason(
    args.selectedCandidate,
    "PURPOSE_NOT_ALIGNED",
  );
  const selectedHasRestatementPenalty = candidateHasRicherReason(
    args.selectedCandidate,
    "BODY_SOURCE_RESTATEMENT",
  );
  const selectedHasRepeatedEnding = candidateHasRicherWarning(
    args.selectedCandidate,
    "REPEATED_SENTENCE_ENDING",
  );

  if (args.decision.overrideUsed && !hasStructuredRejectedCandidates(args.rejected)) {
    return {
      ok: false,
      message: "ai candidate judge used override without structured rejected reasons",
      meta: {
        selectedCandidateIndex: args.selectedCandidate.candidateIndex,
        rejectedCount: args.rejected.length,
      },
    };
  }

  if (selectedHasPurposePenalty) {
    if (!args.decision.overrideUsed) {
      return {
        ok: false,
        message: "ai candidate judge selected PURPOSE_NOT_ALIGNED candidate without override",
        meta: {
          selectedCandidateIndex: args.selectedCandidate.candidateIndex,
          selectedCandidateRicherReasons: args.selectedCandidate.richerBoundary.reasons,
        },
      };
    }

    if (!hasStructuredRejectedCandidates(args.rejected) || !hasNonEmptyJudgeReason(args.reason)) {
      return {
        ok: false,
        message: "ai candidate judge selected PURPOSE_NOT_ALIGNED candidate without comparison reason",
        meta: {
          selectedCandidateIndex: args.selectedCandidate.candidateIndex,
          selectedCandidateRicherReasons: args.selectedCandidate.richerBoundary.reasons,
          rejectedCount: args.rejected.length,
        },
      };
    }
  }

  if (selectedHasRestatementPenalty && !args.decision.restatementPenaltyUsed) {
    return {
      ok: false,
      message: "ai candidate judge selected restatement-penalized candidate without restatement decision flag",
      meta: {
        selectedCandidateIndex: args.selectedCandidate.candidateIndex,
        selectedCandidateRicherReasons: args.selectedCandidate.richerBoundary.reasons,
      },
    };
  }

  if ((selectedHasRestatementPenalty || selectedHasRepeatedEnding) && strongerAlternatives.length > 0) {
    if (!args.decision.overrideUsed) {
      return {
        ok: false,
        message: "ai candidate judge selected penalized candidate without override against stronger alternatives",
        meta: {
          selectedCandidateIndex: args.selectedCandidate.candidateIndex,
          selectedCandidateRicherReasons: args.selectedCandidate.richerBoundary.reasons,
          selectedCandidateRicherWarnings: args.selectedCandidate.richerBoundary.warnings,
          strongerAlternativeIndexes: strongerAlternatives.map((candidate) => candidate.candidateIndex),
        },
      };
    }

    if (!hasStructuredRejectedCandidates(args.rejected)) {
      return {
        ok: false,
        message: "ai candidate judge override lacked structured rejected reasons against stronger alternatives",
        meta: {
          selectedCandidateIndex: args.selectedCandidate.candidateIndex,
          strongerAlternativeIndexes: strongerAlternatives.map((candidate) => candidate.candidateIndex),
        },
      };
    }
  }

  return { ok: true };
}

async function emitCandidateLog(args: {
  provider?: string;
  model?: string;
  requestId: string;
  candidate: CandidateRecord;
}) {
  const event = {
    phase: "pipeline_prose_candidate" as const,
    level: args.candidate.minimalBoundary.ok ? "DEBUG" : "ERROR",
    route: "/api/writer",
    message: args.candidate.minimalBoundary.ok
      ? "pipeline generated prose candidate"
      : "pipeline generated candidate but minimal boundary failed",
    provider: args.provider,
    model: args.model,
    requestId: args.requestId,
    passKind: args.candidate.passKind,
    candidateIndex: args.candidate.candidateIndex,
    diversityHint: args.candidate.diversityHint,
    minimalScore: args.candidate.minimalBoundary.score,
    minimalReasons: args.candidate.minimalBoundary.reasons,
    minimalWarnings: args.candidate.minimalBoundary.warnings,
    richerScore: args.candidate.richerBoundary.score,
    richerReasons: args.candidate.richerBoundary.reasons,
    richerWarnings: args.candidate.richerBoundary.warnings,
    contentHash8: sha256Hex(args.candidate.content).slice(0, 8),
  };
  logEvent(args.candidate.minimalBoundary.ok ? "ok" : "error", event);
  await emitWriterEvent(args.candidate.minimalBoundary.ok ? "ok" : "error", event);
}

function isShapeHardFailBoundary(boundary: FinalProseBoundaryResult): boolean {
  return (
    boundary.reasons.includes("HEAD_SENTENCE_COUNT") ||
    boundary.reasons.includes("BULLET_COUNT") ||
    boundary.reasons.includes("HEAD1_MISSING_PRODUCT_NAME")
  );
}

function countShapeHardFailReasons(boundary: FinalProseBoundaryResult): number {
  return (
    Number(boundary.reasons.includes("HEAD_SENTENCE_COUNT")) +
    Number(boundary.reasons.includes("BULLET_COUNT")) +
    Number(boundary.reasons.includes("HEAD1_MISSING_PRODUCT_NAME"))
  );
}

function chooseBetterShapeCandidate(
  current: CandidateRecord,
  next: CandidateRecord,
): CandidateRecord {
  const currentShapeFails = countShapeHardFailReasons(current.minimalBoundary);
  const nextShapeFails = countShapeHardFailReasons(next.minimalBoundary);

  if (nextShapeFails !== currentShapeFails) {
    return nextShapeFails < currentShapeFails ? next : current;
  }

  if (next.minimalBoundary.score !== current.minimalBoundary.score) {
    return next.minimalBoundary.score > current.minimalBoundary.score ? next : current;
  }

  if (next.minimalBoundary.reasons.length !== current.minimalBoundary.reasons.length) {
    return next.minimalBoundary.reasons.length < current.minimalBoundary.reasons.length
      ? next
      : current;
  }

  return current;
}

function buildCandidateRecord(args: {
  passKind: CandidatePassKind;
  candidateIndex: number;
  diversityHint: CandidateDiversityHint;
  response: {
    content: string;
    apiMs: number;
    status: number;
    statusText: string;
  };
  proseUser: string;
  normalized: NormalizedInput;
}): CandidateRecord {
  return {
    passKind: args.passKind,
    candidateIndex: args.candidateIndex,
    diversityHint: args.diversityHint,
    content: args.response.content,
    apiMs: args.response.apiMs,
    status: args.response.status,
    statusText: args.response.statusText,
    minimalBoundary: evaluateCandidateSelectionBoundary(
      args.response.content,
      args.normalized,
    ),
    richerBoundary: evaluateFinalProseBoundary(args.response.content, args.normalized),
    proseUser: args.proseUser,
  };
}

async function logCandidateGenerationError(args: {
  response: {
    ok: false;
    errorKind: string;
    status: number;
    statusText: string;
    apiMs: number;
    errorText: string;
  };
  provider?: string;
  model?: string;
  requestId: string;
  passKind: CandidatePassKind;
  candidateIndex: number;
  stage: "initial" | "shape_rescue";
}) {
  const errLog = {
    phase: "pipeline_prose_candidate" as const,
    level: args.response.errorKind === "empty" ? "DEBUG" : "ERROR",
    route: "/api/writer",
    message:
      args.response.errorKind === "empty"
        ? `openai returned empty candidate content during ${args.stage}`
        : `openai api error on candidate generation during ${args.stage}: ${args.response.status} ${args.response.statusText}`,
    provider: args.provider,
    model: args.model,
    requestId: args.requestId,
    passKind: args.passKind,
    candidateIndex: args.candidateIndex,
    stage: args.stage,
    status: args.response.status,
    apiMs: args.response.apiMs,
    errorTextPreview: args.response.errorText.slice(0, 500),
  };
  logEvent(args.response.errorKind === "empty" ? "ok" : "error", errLog as any);
  await emitWriterEvent(args.response.errorKind === "empty" ? "ok" : "error", errLog as any);
}

async function generateCandidateWithShapeRescue(args: {
  apiKey: string;
  model?: string;
  provider?: string;
  requestId: string;
  normalized: NormalizedInput;
  proseSystem: string;
  isSNS: boolean;
  usableFacts: AtomicFact[];
  passKind: CandidatePassKind;
  candidateIndex: number;
}): Promise<CandidateRecord | null> {
  const diversityHint = resolveCandidateDiversityHint(args.candidateIndex);
  const proseUser = buildProseUser({
    normalized: args.normalized,
    usableFacts: args.usableFacts,
    diversityHint,
  });

  const initialResponse = await createFinalProse({
    apiKey: args.apiKey,
    model: args.model,
    system: args.proseSystem,
    userMessage: proseUser,
    reasoningEffort: "none",
    verbosity: args.isSNS ? "low" : "medium",
  });

  if (!initialResponse.ok) {
    await logCandidateGenerationError({
      response: initialResponse,
      provider: args.provider,
      model: args.model,
      requestId: args.requestId,
      passKind: args.passKind,
      candidateIndex: args.candidateIndex,
      stage: "initial",
    });
    return null;
  }

  const initialCandidate = buildCandidateRecord({
    passKind: args.passKind,
    candidateIndex: args.candidateIndex,
    diversityHint,
    response: initialResponse,
    proseUser,
    normalized: args.normalized,
  });

  if (!isShapeHardFailBoundary(initialCandidate.minimalBoundary)) {
    return initialCandidate;
  }

  const rescueUser = buildShapeRescueUserMessage(proseUser);
  const rescueResponse = await createFinalProse({
    apiKey: args.apiKey,
    model: args.model,
    system: args.proseSystem,
    userMessage: rescueUser,
    reasoningEffort: "none",
    verbosity: args.isSNS ? "low" : "medium",
  });

  if (!rescueResponse.ok) {
    await logCandidateGenerationError({
      response: rescueResponse,
      provider: args.provider,
      model: args.model,
      requestId: args.requestId,
      passKind: args.passKind,
      candidateIndex: args.candidateIndex,
      stage: "shape_rescue",
    });
    return initialCandidate;
  }

  const rescueCandidate = buildCandidateRecord({
    passKind: args.passKind,
    candidateIndex: args.candidateIndex,
    diversityHint,
    response: rescueResponse,
    proseUser: rescueUser,
    normalized: args.normalized,
  });

  const selectedCandidate = chooseBetterShapeCandidate(initialCandidate, rescueCandidate);

  const rescueLog = {
    phase: "pipeline_prose_shape_rescue" as const,
    level: "DEBUG",
    route: "/api/writer",
    message: "pipeline compared initial prose candidate with shape rescue candidate",
    provider: args.provider,
    model: args.model,
    requestId: args.requestId,
    passKind: args.passKind,
    candidateIndex: args.candidateIndex,
    diversityHint,
    initialScore: initialCandidate.minimalBoundary.score,
    initialReasons: initialCandidate.minimalBoundary.reasons,
    rescueScore: rescueCandidate.minimalBoundary.score,
    rescueReasons: rescueCandidate.minimalBoundary.reasons,
    selectedStage: selectedCandidate === rescueCandidate ? "shape_rescue" : "initial",
  };
  logEvent("ok", rescueLog);
  await emitWriterEvent("ok", rescueLog);

  return selectedCandidate;
}

async function generateIndependentProseCandidates(args: {
  apiKey: string;
  model?: string;
  provider?: string;
  requestId: string;
  normalized: NormalizedInput;
  proseSystem: string;
  isSNS: boolean;
  usableFacts: AtomicFact[];
  passKind: CandidatePassKind;
  count: number;
}): Promise<CandidateBatchResult> {
  const candidates: CandidateRecord[] = [];

  for (let i = 0; i < args.count; i += 1) {
    const candidate = await generateCandidateWithShapeRescue({
      apiKey: args.apiKey,
      model: args.model,
      provider: args.provider,
      requestId: args.requestId,
      normalized: args.normalized,
      proseSystem: args.proseSystem,
      isSNS: args.isSNS,
      usableFacts: args.usableFacts,
      passKind: args.passKind,
      candidateIndex: i,
    });

    if (!candidate) continue;

    candidates.push(candidate);
    await emitCandidateLog({
      provider: args.provider,
      model: args.model,
      requestId: args.requestId,
      candidate,
    });
  }

  return {
    candidates,
    passedCandidates: collectMinimalPassedCandidates(candidates),
  };
}

function buildAiSelectionJudgeSystem(): string {
  return [
    "あなたはEC商品紹介文の候補を比較して最終候補を1つ選ぶ審査者です。",
    "あなたの仕事は、『自然に見える候補』を選ぶことではなく、『入力ゴールに整合し、自然な日本語で、既知の欠点が相対的に少ない候補』を選ぶことです。",
    "minimal fail の候補は選びません。",
    "PURPOSE_NOT_ALIGNED は強い減点対象です。他候補にも同等以上の欠点がある場合を除き、基本は選ばないでください。",
    "BODY_SOURCE_RESTATEMENT は中程度以上の減点対象です。特徴の言い換えだけで終わる候補より、使用場面に着地している候補を優先してください。",
    "REPEATED_SENTENCE_ENDING は中程度の減点対象です。",
    "AUDIENCE_NOT_EXACT_ONCE_IN_HEAD は軽い減点にとどめますが、同点比較では不利にしてください。",
    "比較の優先順位は、1. 入力ゴールとの整合 2. 日本語の自然さ 3. 使用場面の具体性 4. source restatement の少なさ 5. 重複・説明くささの少なさ、の順です。",
    "自然さだけで goal 整合を逆転してはいけません。",
    "richerBoundary の指摘は参考情報ではなく、必ず比較に使ってください。",
    "richerBoundary 上は不利な候補を選ぶ場合は overrideUsed=true とし、なぜ他候補より良いのかを rejected に比較形式で入れてください。",
    "返答は JSON のみです。前置き、補足、コードフェンスは不要です。",
    `返答形式は必ず {"selectedCandidateIndex": number, "decision": {"goalAlignment": "best|tie|override", "naturalJapanese": "best|tie|override", "sceneConcreteness": "best|tie|override", "restatementPenaltyUsed": boolean, "overrideUsed": boolean}, "reason": string, "rejected": [{"candidateIndex": number, "mainReason": string}]} の形にしてください。`,
  ].join("\n");
}

function formatCandidateBoundaryList(values: string[]): string {
  const items = uniqueNonEmptyStrings(values);
  return items.length > 0 ? items.join(", ") : "none";
}

function buildAiSelectionJudgeUser(args: {
  normalized: NormalizedInput;
  candidates: CandidateRecord[];
}): string {
  const lines: string[] = [
    "以下は最小外形条件を通過した候補です。最も良い候補を1つだけ選んでください。",
    "評価観点:",
    "- 入力ゴールとの整合を最優先する",
    "- 日本語として自然で読みやすい",
    "- 使用場面が具体的に読める",
    "- source restatement が少ない",
    "- 重複や説明くささが少ない",
    "",
  ];

  const productName = normalizeJaText(args.normalized.product_name);
  const category = normalizeJaText(args.normalized.category);
  const audience = normalizeJaText(args.normalized.audience);
  const goal = normalizeJaText(args.normalized.goal);

  if (productName) lines.push(`商品名: ${productName}`);
  if (category) lines.push(`カテゴリ: ${category}`);
  if (audience) lines.push(`想定読者: ${audience}`);
  if (goal) lines.push(`入力ゴール: ${goal}`);

  lines.push("");

  for (const candidate of args.candidates) {
    lines.push(`候補 ${candidate.candidateIndex}:`);
    lines.push(candidate.content);
    lines.push("既知の注意:");
    lines.push(`- richer reasons: ${formatCandidateBoundaryList(candidate.richerBoundary.reasons)}`);
    lines.push(`- richer warnings: ${formatCandidateBoundaryList(candidate.richerBoundary.warnings)}`);
    lines.push(`- minimal warnings: ${formatCandidateBoundaryList(candidate.minimalBoundary.warnings)}`);
    lines.push("");
  }

  lines.push(
    `selectedCandidateIndex には、候補番号 ${args.candidates
      .map((candidate) => candidate.candidateIndex)
      .join(", ")} のいずれかを入れてください。`,
  );
  lines.push(
    "overrideUsed を true にする場合は、rejected に非選択候補の主な欠点を必ず入れてください。",
  );

  return lines.join("\n").trim();
}

function parseAiJudgeDecisionMark(
  value: unknown,
): CandidateAiJudgeDecisionMark | null {
  const normalized = normalizeJaText(value).toLowerCase();
  if (normalized === "best" || normalized === "tie" || normalized === "override") {
    return normalized as CandidateAiJudgeDecisionMark;
  }
  return null;
}

function parseAiJudgeDecision(value: unknown): CandidateAiJudgeDecision | null {
  const source = value as Record<string, unknown> | null | undefined;
  if (!source || typeof source !== "object") return null;

  const goalAlignment = parseAiJudgeDecisionMark(source.goalAlignment);
  const naturalJapanese = parseAiJudgeDecisionMark(source.naturalJapanese);
  const sceneConcreteness = parseAiJudgeDecisionMark(source.sceneConcreteness);
  const restatementPenaltyUsed =
    typeof source.restatementPenaltyUsed === "boolean"
      ? source.restatementPenaltyUsed
      : null;
  const overrideUsed =
    typeof source.overrideUsed === "boolean" ? source.overrideUsed : null;

  if (!goalAlignment || !naturalJapanese || !sceneConcreteness) return null;
  if (restatementPenaltyUsed === null || overrideUsed === null) return null;

  return {
    goalAlignment,
    naturalJapanese,
    sceneConcreteness,
    restatementPenaltyUsed,
    overrideUsed,
  };
}

function parseAiJudgeRejected(value: unknown): CandidateAiJudgeRejected[] {
  if (!Array.isArray(value)) return [];

  const out: CandidateAiJudgeRejected[] = [];
  for (const item of value) {
    const source = item as Record<string, unknown> | null | undefined;
    if (!source || typeof source !== "object") continue;

    const rawIndex = source.candidateIndex;
    const candidateIndex =
      typeof rawIndex === "number"
        ? rawIndex
        : Number.parseInt((rawIndex ?? "").toString(), 10);

    if (!Number.isFinite(candidateIndex)) continue;

    const mainReason = normalizeJaText(source.mainReason);
    if (!mainReason) continue;

    out.push({
      candidateIndex,
      mainReason,
    });
  }

  return out;
}

function parseAiSelectionJudgeResponse(
  content: string,
): {
  selectedCandidateIndex: number | null;
  reason: string;
  decision: CandidateAiJudgeDecision | null;
  rejected: CandidateAiJudgeRejected[];
} | null {
  const raw = normalizeJaText(content);
  if (!raw) return null;

  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;

    const selectedIndexRaw =
      parsed?.selectedCandidateIndex ?? parsed?.selectedIndex;
    const selectedCandidateIndex =
      typeof selectedIndexRaw === "number"
        ? selectedIndexRaw
        : Number.parseInt((selectedIndexRaw ?? "").toString(), 10);

    if (!Number.isFinite(selectedCandidateIndex)) return null;

    return {
      selectedCandidateIndex,
      reason: normalizeJaText(parsed?.reason),
      decision: parseAiJudgeDecision(parsed?.decision),
      rejected: parseAiJudgeRejected(parsed?.rejected),
    };
  } catch {
    const indexMatch = cleaned.match(
      /"(?:selectedCandidateIndex|selectedIndex)"\s*:\s*(\d+)/i,
    );
    if (!indexMatch) return null;

    const reasonMatch = cleaned.match(/"reason"\s*:\s*"([^"]*)"/i);

    return {
      selectedCandidateIndex: Number.parseInt(indexMatch[1], 10),
      reason: normalizeJaText(reasonMatch?.[1] ?? ""),
      decision: null,
      rejected: [],
    };
  }
}

async function judgePassedCandidatesWithAi(args: {
  apiKey: string;
  model?: string;
  provider?: string;
  requestId: string;
  normalized: NormalizedInput;
  candidates: CandidateRecord[];
}): Promise<CandidateAiJudgeResult> {
  const system = buildAiSelectionJudgeSystem();
  const userMessage = buildAiSelectionJudgeUser({
    normalized: args.normalized,
    candidates: args.candidates,
  });

  const response = await createFinalProse({
    apiKey: args.apiKey,
    model: args.model,
    system,
    userMessage,
    reasoningEffort: "none",
    verbosity: "low",
  });

  if (!response.ok) {
    const errorLog = {
      phase: "pipeline_candidate_ai_judge" as const,
      level: response.errorKind === "empty" ? "DEBUG" : "ERROR",
      route: "/api/writer",
      message:
        response.errorKind === "empty"
          ? "ai candidate judge returned empty content"
          : `ai candidate judge failed: ${response.status} ${response.statusText}`,
      provider: args.provider,
      model: args.model,
      requestId: args.requestId,
      candidateIndexes: args.candidates.map((candidate) => candidate.candidateIndex),
      status: response.status,
      statusText: response.statusText,
      errorKind: response.errorKind,
      errorTextPreview: response.errorText.slice(0, 500),
    };
    logEvent(response.errorKind === "empty" ? "ok" : "error", errorLog);
    await emitWriterEvent(response.errorKind === "empty" ? "ok" : "error", errorLog);

    return {
      ok: false,
      selectedCandidateIndex: null,
      reason: "",
      raw: "",
      decision: null,
      rejected: [],
      errorKind: response.errorKind === "empty" ? "empty" : "openai_error",
    };
  }

  const parsed = parseAiSelectionJudgeResponse(response.content);
  if (!parsed) {
    const invalidLog = {
      phase: "pipeline_candidate_ai_judge" as const,
      level: "ERROR",
      route: "/api/writer",
      message: "ai candidate judge returned invalid json",
      provider: args.provider,
      model: args.model,
      requestId: args.requestId,
      candidateIndexes: args.candidates.map((candidate) => candidate.candidateIndex),
      rawHash8: sha256Hex(response.content).slice(0, 8),
      rawPreview: response.content.slice(0, 500),
    };
    logEvent("error", invalidLog);
    await emitWriterEvent("error", invalidLog);

    return {
      ok: false,
      selectedCandidateIndex: null,
      reason: "",
      raw: response.content,
      decision: null,
      rejected: [],
      errorKind: "invalid_json",
    };
  }

  if (!parsed.decision) {
    const invalidDecisionLog = {
      phase: "pipeline_candidate_ai_judge" as const,
      level: "ERROR",
      route: "/api/writer",
      message: "ai candidate judge returned json without required decision structure",
      provider: args.provider,
      model: args.model,
      requestId: args.requestId,
      candidateIndexes: args.candidates.map((candidate) => candidate.candidateIndex),
      selectedCandidateIndex: parsed.selectedCandidateIndex,
      rawHash8: sha256Hex(response.content).slice(0, 8),
      rawPreview: response.content.slice(0, 500),
    };
    logEvent("error", invalidDecisionLog);
    await emitWriterEvent("error", invalidDecisionLog);

    return {
      ok: false,
      selectedCandidateIndex: parsed.selectedCandidateIndex,
      reason: parsed.reason,
      raw: response.content,
      decision: null,
      rejected: parsed.rejected,
      errorKind: "invalid_decision",
    };
  }

  const allowedIndexes = new Set(
    args.candidates.map((candidate) => candidate.candidateIndex),
  );
  if (!allowedIndexes.has(parsed.selectedCandidateIndex ?? -1)) {
    const invalidIndexLog = {
      phase: "pipeline_candidate_ai_judge" as const,
      level: "ERROR",
      route: "/api/writer",
      message: "ai candidate judge returned out-of-range index",
      provider: args.provider,
      model: args.model,
      requestId: args.requestId,
      candidateIndexes: args.candidates.map((candidate) => candidate.candidateIndex),
      selectedCandidateIndex: parsed.selectedCandidateIndex,
      rawHash8: sha256Hex(response.content).slice(0, 8),
    };
    logEvent("error", invalidIndexLog);
    await emitWriterEvent("error", invalidIndexLog);

    return {
      ok: false,
      selectedCandidateIndex: parsed.selectedCandidateIndex,
      reason: parsed.reason,
      raw: response.content,
      decision: parsed.decision,
      rejected: parsed.rejected,
      errorKind: "invalid_index",
    };
  }

  const selectedCandidate = args.candidates.find(
    (candidate) => candidate.candidateIndex === parsed.selectedCandidateIndex,
  );

  if (!selectedCandidate) {
    return {
      ok: false,
      selectedCandidateIndex: parsed.selectedCandidateIndex,
      reason: parsed.reason,
      raw: response.content,
      decision: parsed.decision,
      rejected: parsed.rejected,
      errorKind: "invalid_index",
    };
  }

  const validation = validateAiJudgeSelection({
    candidates: args.candidates,
    selectedCandidate,
    decision: parsed.decision,
    rejected: parsed.rejected,
    reason: parsed.reason,
  });

  if (!validation.ok) {
    const invalidDecisionLog = {
      phase: "pipeline_candidate_ai_judge" as const,
      level: "ERROR",
      route: "/api/writer",
      message: validation.message ?? "ai candidate judge decision validation failed",
      provider: args.provider,
      model: args.model,
      requestId: args.requestId,
      candidateIndexes: args.candidates.map((candidate) => candidate.candidateIndex),
      selectedCandidateIndex: parsed.selectedCandidateIndex,
      decision: parsed.decision,
      rejected: parsed.rejected,
      selectedCandidateRicherReasons: selectedCandidate.richerBoundary.reasons,
      selectedCandidateRicherWarnings: selectedCandidate.richerBoundary.warnings,
      rawHash8: sha256Hex(response.content).slice(0, 8),
      ...(validation.meta ?? {}),
    };
    logEvent("error", invalidDecisionLog);
    await emitWriterEvent("error", invalidDecisionLog);

    return {
      ok: false,
      selectedCandidateIndex: parsed.selectedCandidateIndex,
      reason: parsed.reason,
      raw: response.content,
      decision: parsed.decision,
      rejected: parsed.rejected,
      errorKind: "invalid_decision",
    };
  }

  const successLog = {
    phase: "pipeline_candidate_ai_judge" as const,
    level: "DEBUG",
    route: "/api/writer",
    message: "ai candidate judge selected a candidate",
    provider: args.provider,
    model: args.model,
    requestId: args.requestId,
    candidateIndexes: args.candidates.map((candidate) => candidate.candidateIndex),
    selectedCandidateIndex: parsed.selectedCandidateIndex,
    decision: parsed.decision,
    rejected: parsed.rejected,
    reason: parsed.reason,
    rawHash8: sha256Hex(response.content).slice(0, 8),
  };
  logEvent("ok", successLog);
  await emitWriterEvent("ok", successLog);

  return {
    ok: true,
    selectedCandidateIndex: parsed.selectedCandidateIndex,
    reason: parsed.reason,
    raw: response.content,
    decision: parsed.decision,
    rejected: parsed.rejected,
  };
}

/* =========================
   Pipeline API
========================= */

export type WriterPipelineArgs = {
  rawPrompt: string;
  normalized: NormalizedInput;
  provider?: string;
  model?: string;
  temperature: number;
  apiKey: string;
  t0: number;
  elapsed?: () => number;
  requestId: string;
  productId?: string | null;
  productContext?: ProductContext | null;
};

function mapWriterErrorStatus(reason: WriterErrorReason): number {
  switch (reason) {
    case "validation":
    case "bad_request":
      return 400;
    case "content_policy":
      return 403;
    case "rate_limit":
      return 429;
    case "timeout":
      return 504;
    case "openai":
    case "openai_api_error":
    case "openai_empty_content":
      return 502;
    case "boundary_failed":
    case "candidate_selection_failed":
      return 422;
    default:
      return 500;
  }
}

function mapOpenAiFailure(args: {
  errorKind: string;
  status: number;
  statusText: string;
  errorText: string;
}): Pick<WriterPipelineError, "reason" | "message" | "code" | "meta"> {
  const errorKind = (args.errorKind ?? "").toString();

  if (errorKind === "empty") {
    return {
      reason: "openai_empty_content",
      code: "openai_empty_content",
      message: "openai returned empty content",
      meta: {
        status: args.status,
        statusText: args.statusText,
      },
    };
  }

  if (errorKind === "rate_limit") {
    return {
      reason: "rate_limit",
      code: "openai_rate_limit",
      message: "openai rate limit",
      meta: {
        status: args.status,
        statusText: args.statusText,
      },
    };
  }

  if (errorKind === "timeout") {
    return {
      reason: "timeout",
      code: "openai_timeout",
      message: "openai timeout",
      meta: {
        status: args.status,
        statusText: args.statusText,
      },
    };
  }

  if (errorKind === "bad_request") {
    return {
      reason: "bad_request",
      code: "openai_bad_request",
      message: "openai bad request",
      meta: {
        status: args.status,
        statusText: args.statusText,
      },
    };
  }

  return {
    reason: "openai_api_error",
    code: "openai_api_error",
    message: "openai api error",
    meta: {
      status: args.status,
      statusText: args.statusText,
      errorTextPreview: args.errorText.slice(0, 500),
    },
  };
}

export async function runWriterPipeline(
  args: WriterPipelineArgs,
): Promise<Response> {
  const result = await runWriterPipelineCore(args);

  if (!result.ok) {
    const errorResult = result as WriterPipelineError;
    return NextResponse.json(
      {
        ok: false,
        error: {
          reason: errorResult.reason,
          message: errorResult.message,
          ...(errorResult.code ? { code: errorResult.code } : {}),
        },
        meta: errorResult.meta ?? undefined,
      },
      { status: mapWriterErrorStatus(errorResult.reason) },
    );
  }

  const finalized = finalizeResponseText(result.openai.content);

  const finalizeLog = {
    phase: "pipeline_finalize" as const,
    level: "DEBUG",
    route: "/api/writer",
    message: "pipeline finalized response text",
    provider: result.ctx.request.provider,
    model: result.ctx.request.model,
    requestId: result.ctx.request.requestId,
    selectedHash8: sha256Hex(result.openai.content).slice(0, 8),
    finalHash8: sha256Hex(finalized.text).slice(0, 8),
    finalTextChanged: finalized.changed,
    selectedLength: result.openai.content.length,
    finalLength: finalized.text.length,
    repairKeys: finalized.repairKeys,
  };
  logEvent("ok", finalizeLog);
  await emitWriterEvent("ok", finalizeLog);

  return NextResponse.json(
    {
      ok: true,
      data: {
        text: finalized.text,
        meta: {
          style: (result.ctx.input.normalized.style ?? "").toString(),
          tone: (result.ctx.input.normalized.tone ?? "").toString(),
          locale: "ja-JP",
        },
      },
      output: finalized.text,
    },
    { status: 200 },
  );
}

export async function runWriterPipelineCore(
  args: WriterPipelineArgs,
): Promise<WriterPipelineResult> {
  const {
    rawPrompt,
    normalized,
    provider,
    model,
    temperature,
    apiKey,
    t0,
    requestId,
    productId,
    productContext,
  } = args;

  const templateKey = resolveTemplateKey(normalized);
  const isSNS = isSnsLikeTemplate(templateKey);
  const toneKey = resolveTonePresetKey(normalized.tone, normalized.style);
  const ctaMode = resolveCtaMode(normalized);
  const atomicFacts = buildAtomicFacts(normalized);
  const usableFacts = buildUsableFactsForRenderer(atomicFacts);

  logProductContextStatus({
    productId: productId ?? null,
    context: productContext ?? null,
    meta: { source: "writer.pipeline", requestId, path: "/api/writer" },
  });

  const precisionPayload = buildPrecisionProductPayload({
    productId: productId ?? null,
    context: productContext ?? null,
  });

  const productFacts = buildProductFactsDto({
    productId: productId ?? null,
    enabled: false,
    context: productContext ?? null,
    error: null,
  });

  const proseSystem = buildProseSystem({
    toneKey,
    isSNS,
  });

  const ctx: WriterPipelineCtx = {
    request: {
      requestId,
      route: "/api/writer",
      provider,
      model,
      temperature,
      t0,
    },
    input: {
      rawPrompt,
      normalized,
      productId: productId ?? null,
      productContext: productContext ?? null,
      templateKey,
      isSNS,
      toneKey,
    },
    flags: { cta: { mode: ctaMode } },
    contracts: {
      ctaBlock: buildCtaBlockContract(),
    },
    facts: {
      items: atomicFacts,
    },
    prompts: {
      proseSystem,
      proseUser: "",
      debug: {
        proseSystemHash8: sha256Hex(proseSystem).slice(0, 8),
        proseUserHash8: sha256Hex("").slice(0, 8),
      },
    },
    product: {
      precisionPayload,
      productFacts,
      productFactsBlock: null,
    },
  };

  const decideLog = {
    phase: "pipeline_decide" as const,
    level: "DEBUG",
    route: "/api/writer",
    message: "pipeline prepared minimal facts and ai-first prose request",
    provider,
    model,
    requestId,
    toneKey,
    templateKey,
    isSNS,
    ctaMode,
    proseSystemHash8: ctx.prompts.debug?.proseSystemHash8 ?? null,
    atomicFactCount: atomicFacts.length,
    usableFactIds: usableFacts.map((fact) => fact.id),
  };
  logEvent("ok", decideLog);
  await emitWriterEvent("ok", decideLog);

  if (isMinimalInputRescueTarget({ normalized, templateKey, rawPrompt })) {
    const rescueTemplate = resolveMinimalInputRescueTemplate(templateKey);
    const rescueText = buildMinimalInputRescueText({
      templateKey,
      rawPrompt,
    });

    const rescueLog = {
      phase: "pipeline_minimal_input_rescue" as const,
      level: "DEBUG",
      route: "/api/writer",
      message: "pipeline used template-aware minimal-input rescue before normal prose generation",
      provider,
      model,
      requestId,
      templateKey,
      rescueTemplate,
      contentHash8: sha256Hex(rescueText).slice(0, 8),
    };
    logEvent("ok", rescueLog);
    await emitWriterEvent("ok", rescueLog);

    return {
      ok: true,
      ctx,
      openai: {
        content: rescueText,
        apiMs: 0,
        status: 200,
        statusText: "OK",
      },
    };
  }

  const initialBatch = await generateIndependentProseCandidates({
    apiKey,
    model,
    provider,
    requestId,
    normalized,
    proseSystem: ctx.prompts.proseSystem,
    isSNS,
    usableFacts,
    passKind: "initial",
    count: 3,
  });

  const passedCandidates = initialBatch.passedCandidates;
  const diagnosticCandidate = selectBestDiagnosticCandidate(initialBatch.candidates);

  if (passedCandidates.length === 0) {
    return {
      ok: false,
      reason: "candidate_selection_failed",
      code: "final_prose_boundary_failed",
      message: "generated prose did not satisfy minimal boundary",
      meta: {
        requestId,
        candidateCount: initialBatch.candidates.length,
        passedCandidateCount: 0,
        bestScore: diagnosticCandidate?.minimalBoundary.score ?? null,
        reasons: diagnosticCandidate?.minimalBoundary.reasons ?? [],
        warnings: diagnosticCandidate?.minimalBoundary.warnings ?? [],
        richerReasons: diagnosticCandidate?.richerBoundary.reasons ?? [],
      },
    };
  }

  let bestCandidate: CandidateRecord = passedCandidates[0];
  let selectionSource: "single_pass" | "ai_judge" | "ai_judge_fallback" =
    "single_pass";
  let aiJudgeUsed = false;
  let aiJudgeReason = "";
  let aiJudgeRawHash8: string | null = null;
  let aiSelectedIndex: number | null = null;
  let aiJudgeDecision: CandidateAiJudgeDecision | null = null;
  let aiRejectedCandidates: CandidateAiJudgeRejected[] = [];

  if (passedCandidates.length >= 2) {
    aiJudgeUsed = true;

    const aiJudgeResult = await judgePassedCandidatesWithAi({
      apiKey,
      model,
      provider,
      requestId,
      normalized,
      candidates: passedCandidates,
    });

    aiJudgeReason = aiJudgeResult.reason;
    aiSelectedIndex = aiJudgeResult.selectedCandidateIndex;
    aiJudgeDecision = aiJudgeResult.decision;
    aiRejectedCandidates = aiJudgeResult.rejected;
    aiJudgeRawHash8 = aiJudgeResult.raw
      ? sha256Hex(aiJudgeResult.raw).slice(0, 8)
      : null;

    if (aiJudgeResult.ok) {
      const selectedByAi = passedCandidates.find(
        (candidate) =>
          candidate.candidateIndex === aiJudgeResult.selectedCandidateIndex,
      );

      if (selectedByAi) {
        bestCandidate = selectedByAi;
        selectionSource = "ai_judge";
      } else {
        const fallbackCandidate = selectFallbackCandidate(passedCandidates);
        if (fallbackCandidate) {
          bestCandidate = fallbackCandidate;
          selectionSource = "ai_judge_fallback";
        }
      }
    } else {
      const fallbackCandidate = selectFallbackCandidate(passedCandidates);
      if (fallbackCandidate) {
        bestCandidate = fallbackCandidate;
        selectionSource = "ai_judge_fallback";
      }
    }
  }

  const topAlternativeCandidate = selectBestAlternativeCandidate(
    passedCandidates,
    bestCandidate.candidateIndex,
  );

  const selectionLog = {
    phase: "pipeline_candidate_selection" as const,
    level: "DEBUG",
    route: "/api/writer",
    message: "pipeline selected best candidate from minimal-filtered prose candidates",
    provider,
    model,
    requestId,
    candidateCount: initialBatch.candidates.length,
    passedCandidateCount: passedCandidates.length,
    selectionSource,
    aiJudgeUsed,
    aiSelectedIndex,
    aiJudgeReason,
    aiJudgeRawHash8,
    aiJudgeDecision,
    aiRejectedCandidates,
    aiOverrideUsed: aiJudgeDecision?.overrideUsed ?? false,
    selectedPassKind: bestCandidate.passKind,
    selectedCandidateIndex: bestCandidate.candidateIndex,
    selectedCandidateDiversityHint: bestCandidate.diversityHint,
    minimalScore: bestCandidate.minimalBoundary.score,
    minimalReasons: bestCandidate.minimalBoundary.reasons,
    minimalWarnings: bestCandidate.minimalBoundary.warnings,
    richerScore: bestCandidate.richerBoundary.score,
    richerReasons: bestCandidate.richerBoundary.reasons,
    richerWarnings: bestCandidate.richerBoundary.warnings,
    selectedCandidateRicherReasons: bestCandidate.richerBoundary.reasons,
    selectedCandidateRicherWarnings: bestCandidate.richerBoundary.warnings,
    topAlternativeCandidateIndex: topAlternativeCandidate?.candidateIndex ?? null,
    topAlternativeCandidateDiversityHint: topAlternativeCandidate?.diversityHint ?? null,
    topAlternativeRicherScore: topAlternativeCandidate?.richerBoundary.score ?? null,
    topAlternativeRicherReasons: topAlternativeCandidate?.richerBoundary.reasons ?? [],
    topAlternativeRicherWarnings:
      topAlternativeCandidate?.richerBoundary.warnings ?? [],
    topAlternativeMinimalWarnings:
      topAlternativeCandidate?.minimalBoundary.warnings ?? [],
    contentHash8: sha256Hex(bestCandidate.content).slice(0, 8),
  };
  logEvent("ok", selectionLog);
  await emitWriterEvent("ok", selectionLog);

  ctx.prompts.proseUser = bestCandidate.proseUser;
  if (ctx.prompts.debug) {
    ctx.prompts.debug.proseUserHash8 = sha256Hex(ctx.prompts.proseUser).slice(
      0,
      8,
    );
  }

  observeDensityA({
    normalized,
    outputText: bestCandidate.content,
    requestId,
    provider,
    model,
    templateKey,
    isSNS,
    ctaMode,
    hasProductFacts: false,
  });

  const proseLog = {
    phase: "pipeline_prose" as const,
    level: "DEBUG",
    route: "/api/writer",
    message: "pipeline generated prose from ai-first renderer",
    provider,
    model,
    requestId,
    minimalScore: bestCandidate.minimalBoundary.score,
    minimalReasons: bestCandidate.minimalBoundary.reasons,
    minimalWarnings: bestCandidate.minimalBoundary.warnings,
    richerScore: bestCandidate.richerBoundary.score,
    richerReasons: bestCandidate.richerBoundary.reasons,
    richerWarnings: bestCandidate.richerBoundary.warnings,
    contentHash8: sha256Hex(bestCandidate.content).slice(0, 8),
  };
  logEvent("ok", proseLog);
  await emitWriterEvent("ok", proseLog);

  return {
    ok: true,
    ctx,
    openai: {
      content: bestCandidate.content,
      apiMs: bestCandidate.apiMs,
      status: bestCandidate.status,
      statusText: bestCandidate.statusText,
    },
  };
}
