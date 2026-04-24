// app/api/writer/pipeline.ts
import { NextResponse } from "next/server";
import {
  sha256Hex,
  logEvent,
  emitWriterEvent,
} from "./_shared/logger";
import { createFinalProse } from "./openai-client";
import {
  buildSystemPrompt,
  getArticleTypeLabel,
  resolveArticleType,
  type ArticleType,
} from "./tone-utils";
import type { ProductContext } from "@/server/products/repository";
import { logProductContextStatus } from "./logger";
import {
  buildPrecisionProductPayload,
  buildProductFactsDto,
  buildProductFactsBlock,
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
    noticeReason?: string | null;
    articleType?: string | null;
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

export type DetailLevel = "concise" | "standard" | "detailed";

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

export type DetailBudget = {
  usableFacts: {
    spec: number;
    evidence: number;
    keyword: number;
    constraint: number;
    total: number;
  };
  promptContext: {
    materialFacts: number;
    scene: number;
    value: number;
    evidence: number;
    guard: number;
  };
  selection: {
    targetTotalChars: number;
    targetBulletAverageChars: number;
    scoreDriftTolerance: number;
    alignmentScoreMinGap: number;
  };
};

export type CandidateDetailBand = "concise" | "standard" | "detailed";

export type CandidateDetailPlanName = "strict" | "center" | "upper_edge";

export type CandidateDetailPlan = {
  name: CandidateDetailPlanName;
  requestedDetailLevel: DetailLevel;
  budget: DetailBudget;
};

export type CandidateDetailProfile = {
  totalChars: number;
  headChars: number;
  bulletChars: number;
  bulletCount: number;
  averageBulletChars: number;
  band: CandidateDetailBand;
  alignmentScore: number;
  requestedDetailLevel: DetailLevel;
  requestedPlanName: CandidateDetailPlanName;
  isInRequestedBand: boolean;
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
    articleType: ArticleType;
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
    productFactsBlock: ReturnType<typeof buildProductFactsBlock>;
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

function hasUsableProductFactsBlock(
  block: ReturnType<typeof buildProductFactsBlock> | null | undefined,
): boolean {
  if (!block) return false;
  return (
    block.scene.length > 0 ||
    block.value.length > 0 ||
    block.evidence.length > 0 ||
    block.guard.length > 0
  );
}


function resolveTemplateKey(n: NormalizedInput): string {
  const metaTemplate = n.meta?.template;
  const raw = (metaTemplate ?? n.platform ?? "").toString().trim().toLowerCase();

  if (!raw) return "product_intro";
  if (raw === "product_intro") return "product_intro";
  if (raw === "product_compare") return "product_compare";
  if (raw === "notice") return "notice";

  if (
    raw === "lp" ||
    raw === "email" ||
    raw === "sns_short" ||
    raw === "headline_only" ||
    raw === "sns" ||
    raw === "headline"
  ) {
    return "product_intro";
  }

  return "product_intro";
}

function isSnsLikeTemplate(_templateKey: string): boolean {
  return false;
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
  return "off";
}

function resolveDetailLevel(n: NormalizedInput): DetailLevel {
  const rawCandidates = [
    n.length_hint,
    (n as any)?.detail,
    (n as any)?.metaDetail,
    (n as any)?.meta?.detail,
    (n as any)?.meta?.length,
  ];

  for (const candidate of rawCandidates) {
    const value = normalizeJaText(candidate).toLowerCase();
    if (!value) continue;
    if (value === "concise" || value === "short") return "concise";
    if (value === "detailed" || value === "long") return "detailed";
    if (value === "standard" || value === "medium") return "standard";
  }

  return "standard";
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

type MinimalInputRescueTemplate = "product_intro" | "product_compare" | "notice";

function resolveMinimalInputRescueTemplate(
  templateKey: string,
): MinimalInputRescueTemplate | null {
  const key = normalizeJaText(templateKey).toLowerCase();

  if (key === "product_intro") return "product_intro";
  if (key === "product_compare") return "product_compare";
  if (key === "notice") return "notice";

  return "product_intro";
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

function buildMinimalInputProductIntroRescueText(rawPrompt: string): string {
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

function buildMinimalInputProductCompareRescueText(rawPrompt: string): string {
  const topic = extractPromptTopic(rawPrompt);
  const subject = topic ? `${topic}のご案内` : "ご案内";

  return [
    `件名: ${subject}`,
    "",
    topic
      ? `${topic}を比べながら選ぶときの要点を短く確認しやすい下書きです。`
      : "比較・選び方向けの要点を短く確認しやすい下書きです。",
    "詳細が固まり次第、そのまま比較の判断材料を書き足しやすい最小構成にしています。",
    "",
    "・冒頭で伝えたい内容を短く示します",
    "・必要な情報を順番に確認しやすく並べます",
    "・最後に返信や確認の導線を置きます",
  ].join("\n");
}

function buildMinimalInputNoticeRescueText(rawPrompt: string): string {
  const topic = extractPromptTopic(rawPrompt);

  return [
    topic
      ? `${topic}についてお知らせしたい内容を短く整える下書きです。`
      : "お知らせ向けの短い下書きです。",
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
    case "product_intro":
      return buildMinimalInputProductIntroRescueText(args.rawPrompt);
    case "product_compare":
      return buildMinimalInputProductCompareRescueText(args.rawPrompt);
    case "notice":
      return buildMinimalInputNoticeRescueText(args.rawPrompt);
    default:
      return buildMinimalInputProductIntroRescueText(args.rawPrompt);
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

function cloneDetailBudget(budget: DetailBudget): DetailBudget {
  return {
    usableFacts: { ...budget.usableFacts },
    promptContext: { ...budget.promptContext },
    selection: { ...budget.selection },
  };
}

function resolveDetailBudget(detailLevel: DetailLevel): DetailBudget {
  if (detailLevel === "concise") {
    return {
      usableFacts: {
        spec: 1,
        evidence: 0,
        keyword: 0,
        constraint: 0,
        total: 3,
      },
      promptContext: {
        materialFacts: 1,
        scene: 0,
        value: 0,
        evidence: 0,
        guard: 0,
      },
      selection: {
        targetTotalChars: 110,
        targetBulletAverageChars: 12,
        scoreDriftTolerance: 10,
        alignmentScoreMinGap: 5,
      },
    };
  }

  if (detailLevel === "detailed") {
    return {
      usableFacts: {
        spec: 3,
        evidence: 2,
        keyword: 1,
        constraint: 1,
        total: 8,
      },
      promptContext: {
        materialFacts: 6,
        scene: 3,
        value: 2,
        evidence: 3,
        guard: 1,
      },
      selection: {
        targetTotalChars: 184,
        targetBulletAverageChars: 29,
        scoreDriftTolerance: 14,
        alignmentScoreMinGap: 6,
      },
    };
  }

  return {
    usableFacts: {
      spec: 2,
      evidence: 1,
      keyword: 0,
      constraint: 0,
      total: 5,
    },
    promptContext: {
      materialFacts: 3,
      scene: 1,
      value: 1,
      evidence: 1,
      guard: 0,
    },
    selection: {
      targetTotalChars: 150,
      targetBulletAverageChars: 21,
      scoreDriftTolerance: 12,
      alignmentScoreMinGap: 6,
    },
  };
}

function resolveCandidateDetailPlanName(
  candidateIndex: number,
): CandidateDetailPlanName {
  switch (candidateIndex) {
    case 0:
      return "strict";
    case 1:
      return "center";
    default:
      return "upper_edge";
  }
}

function resolveDetailPlanLabel(name: CandidateDetailPlanName): string {
  switch (name) {
    case "strict":
      return "下限寄り";
    case "upper_edge":
      return "上限寄り";
    default:
      return "中央";
  }
}

function resolveCandidateDetailPlan(
  detailLevel: DetailLevel,
  candidateIndex: number,
): CandidateDetailPlan {
  const name = resolveCandidateDetailPlanName(candidateIndex);
  const budget = cloneDetailBudget(resolveDetailBudget(detailLevel));

  if (detailLevel === "concise") {
    if (name === "strict") {
      budget.usableFacts = {
        spec: 1,
        evidence: 0,
        keyword: 0,
        constraint: 0,
        total: 3,
      };
      budget.promptContext = {
        materialFacts: 1,
        scene: 0,
        value: 0,
        evidence: 0,
        guard: 0,
      };
      budget.selection.targetTotalChars = 102;
      budget.selection.targetBulletAverageChars = 11;
    } else if (name === "center") {
      budget.usableFacts = {
        spec: 1,
        evidence: 0,
        keyword: 0,
        constraint: 0,
        total: 3,
      };
      budget.promptContext = {
        materialFacts: 1,
        scene: 1,
        value: 0,
        evidence: 0,
        guard: 0,
      };
      budget.selection.targetTotalChars = 112;
      budget.selection.targetBulletAverageChars = 13;
    } else if (name === "upper_edge") {
      budget.usableFacts = {
        spec: 1,
        evidence: 0,
        keyword: 0,
        constraint: 0,
        total: 4,
      };
      budget.promptContext = {
        materialFacts: 1,
        scene: 1,
        value: 0,
        evidence: 0,
        guard: 0,
      };
      budget.selection.targetTotalChars = 122;
      budget.selection.targetBulletAverageChars = 15;
    }
  } else if (detailLevel === "standard") {
    if (name === "strict") {
      budget.usableFacts = {
        spec: 1,
        evidence: 1,
        keyword: 0,
        constraint: 0,
        total: 4,
      };
      budget.promptContext = {
        materialFacts: 2,
        scene: 1,
        value: 0,
        evidence: 0,
        guard: 0,
      };
      budget.selection.targetTotalChars = 142;
      budget.selection.targetBulletAverageChars = 18;
    } else if (name === "center") {
      budget.usableFacts = {
        spec: 2,
        evidence: 1,
        keyword: 0,
        constraint: 0,
        total: 5,
      };
      budget.promptContext = {
        materialFacts: 2,
        scene: 1,
        value: 1,
        evidence: 1,
        guard: 0,
      };
      budget.selection.targetTotalChars = 152;
      budget.selection.targetBulletAverageChars = 21;
    } else if (name === "upper_edge") {
      budget.usableFacts = {
        spec: 2,
        evidence: 1,
        keyword: 0,
        constraint: 0,
        total: 6,
      };
      budget.promptContext = {
        materialFacts: 3,
        scene: 2,
        value: 1,
        evidence: 1,
        guard: 0,
      };
      budget.selection.targetTotalChars = 164;
      budget.selection.targetBulletAverageChars = 24;
    }
  } else {
    if (name === "strict") {
      budget.usableFacts = {
        spec: 2,
        evidence: 2,
        keyword: 0,
        constraint: 0,
        total: 6,
      };
      budget.promptContext = {
        materialFacts: 4,
        scene: 2,
        value: 1,
        evidence: 2,
        guard: 1,
      };
      budget.selection.targetTotalChars = 174;
      budget.selection.targetBulletAverageChars = 27;
    } else if (name === "center") {
      budget.selection.targetTotalChars = 184;
      budget.selection.targetBulletAverageChars = 29;
    } else if (name === "upper_edge") {
      budget.usableFacts = {
        spec: 3,
        evidence: 2,
        keyword: 1,
        constraint: 1,
        total: 9,
      };
      budget.promptContext = {
        materialFacts: 7,
        scene: 3,
        value: 3,
        evidence: 4,
        guard: 1,
      };
      budget.selection.targetTotalChars = 196;
      budget.selection.targetBulletAverageChars = 32;
    }
  }

  return {
    name,
    requestedDetailLevel: detailLevel,
    budget,
  };
}

function isInRequestedDetailBand(
  band: CandidateDetailBand,
  requestedDetailLevel: DetailLevel,
): boolean {
  return band === requestedDetailLevel;
}
function buildUsableFactsForRenderer(
  facts: AtomicFact[],
  detailPlan: CandidateDetailPlan,
): AtomicFact[] {
  const budget = detailPlan.budget;
  const productFact = pickPrimaryFactByKind(facts, "PRODUCT_NAME");
  const categoryFact = pickPrimaryFactByKind(facts, "CATEGORY");
  const audienceFact = pickPrimaryFactByKind(facts, "AUDIENCE");
  const specFacts = filterFactsByKind(facts, "SPEC");
  const evidenceFacts = filterFactsByKind(facts, "EVIDENCE");
  const keywordFacts = filterFactsByKind(facts, "KEYWORD");
  const constraintFacts = filterFactsByKind(facts, "CONSTRAINT");

  const primaryAnchorFact = audienceFact ?? categoryFact;
  const secondaryAnchorFact =
    audienceFact && categoryFact
      ? primaryAnchorFact?.id === audienceFact.id
        ? categoryFact
        : audienceFact
      : null;

  const materialFacts = uniqueFacts([
    ...specFacts,
    ...evidenceFacts,
    ...keywordFacts,
    ...constraintFacts,
  ]);

  if (detailPlan.requestedDetailLevel === "concise") {
    const fallbackAnchorFact = primaryAnchorFact ?? secondaryAnchorFact;

    if (detailPlan.name === "strict") {
      return uniqueFacts([
        productFact,
        fallbackAnchorFact,
        materialFacts[0] ?? null,
      ]).slice(0, budget.usableFacts.total);
    }

    if (detailPlan.name === "upper_edge") {
      return uniqueFacts([
        productFact,
        fallbackAnchorFact,
        materialFacts[0] ?? null,
        materialFacts[1] ?? null,
      ]).slice(0, budget.usableFacts.total);
    }

    return uniqueFacts([
      productFact,
      fallbackAnchorFact,
      materialFacts[0] ?? null,
    ]).slice(0, budget.usableFacts.total);
  }

  if (detailPlan.requestedDetailLevel === "standard") {
    if (detailPlan.name === "strict") {
      return uniqueFacts([
        productFact,
        primaryAnchorFact,
        materialFacts[0] ?? null,
        materialFacts[1] ?? null,
      ]).slice(0, budget.usableFacts.total);
    }

    if (detailPlan.name === "upper_edge") {
      return uniqueFacts([
        productFact,
        primaryAnchorFact,
        materialFacts[0] ?? null,
        materialFacts[1] ?? null,
        secondaryAnchorFact,
        materialFacts[2] ?? null,
      ]).slice(0, budget.usableFacts.total);
    }

    return uniqueFacts([
      productFact,
      primaryAnchorFact,
      materialFacts[0] ?? null,
      materialFacts[1] ?? null,
      secondaryAnchorFact,
    ]).slice(0, budget.usableFacts.total);
  }

  return uniqueFacts([
    productFact,
    primaryAnchorFact,
    secondaryAnchorFact,
    ...materialFacts,
  ]).slice(0, budget.usableFacts.total);
}

/* =========================
   Prose Prompt
========================= */

function buildDetailGuidanceLines(detailLevel: DetailLevel): string[] {
  if (detailLevel === "concise") {
    return [
      "要求された詳しさは簡潔帯です。必要な情報だけを残し、補足理由を重ねすぎないでください。",
      "ヘッドと箇条書きで同じ内容を言い換えて繰り返さず、一項目ごとの情報を短く止めてください。",
    ];
  }

  if (detailLevel === "detailed") {
    return [
      "要求された詳しさはやや詳しめ帯です。自然な日本語のまま、入力材料の範囲で一段だけ厚みを持たせてください。",
      "ただし説明を広げすぎず、使用場面と扱いやすさがつながる密度に留めてください。",
    ];
  }

  return [
    "要求された詳しさは標準帯です。自然な日本語のまま、短すぎず長すぎない必要十分な密度を保ってください。",
    "場面・特徴・扱いやすさのうち必要な分だけを使い、説明の重複を避けてください。",
  ];
}

function buildProseSystem(args: {
  articleType: ArticleType;
  isSNS: boolean;
  detailLevel: DetailLevel;
}): string {
  const baseSystem = buildSystemPrompt({
    overrides: undefined,
  });

  const systemLines = [
    "あなたはEC向けの商品紹介文を書くライターです。出力は日本語の本文のみです。",
    "自然な日本語を最優先してください。説明くささや、型どおりに埋める感じを避けてください。",
    "意味判断は入力からあなたが行ってください。機械側の分類名や推定ラベルは本文に持ち込まないでください。",
    "入力にない具体値や比較優位は足さないでください。",
    "英字の項目名や変数名は本文に出さないでください。",
    args.articleType === "faq"
      ? "FAQ形式では、Q. と A. の組み合わせだけで書いてください。自己評価や注釈は出さないでください。"
      : "見出し、FAQ、自己評価、注釈は出さないでください。",
    ...buildDetailGuidanceLines(args.detailLevel),
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
function isLowFactDetailedContext(args: {
  detailPlan: CandidateDetailPlan;
  usableFacts: AtomicFact[];
  productFactsBlock: ReturnType<typeof buildProductFactsBlock>;
}): boolean {
  if (args.detailPlan.requestedDetailLevel !== "detailed") return false;

  const materialFactCount = args.usableFacts.filter((fact) =>
    ["SPEC", "EVIDENCE", "KEYWORD", "CONSTRAINT"].includes(fact.kind),
  ).length;

  const productFactCount =
    args.productFactsBlock.scene.length +
    args.productFactsBlock.value.length +
    args.productFactsBlock.evidence.length;

  return materialFactCount <= 3 && productFactCount <= 1;
}

function buildDetailGuidanceBlock(args: {
  detailLevel: DetailLevel;
  detailPlan: CandidateDetailPlan;
  lowFactDetailed: boolean;
}): string[] {
  const planLabel = resolveDetailPlanLabel(args.detailPlan.name);

  if (args.detailLevel === "concise") {
    if (args.detailPlan.name === "strict") {
      return [
        `今回の候補は簡潔帯の${planLabel}です。必要なことだけを残し、補足の説明で広げすぎないでください。`,
        "場面は一つに留め、別の用途や感想語を足して長くしないでください。",
      ];
    }

    if (args.detailPlan.name === "upper_edge") {
      return [
        `今回の候補は簡潔帯の${planLabel}です。短さを保ったまま、一段だけ補足してかまいません。`,
        "ただし同じ価値の言い換えや、二つ目の用途への脱線は避けてください。",
      ];
    }

    return [
      `今回の候補は簡潔帯の${planLabel}です。短く伝わる核を優先し、一つの流れでまとめてください。`,
      "箇条書きは一項目につき一つの情報で止め、理由を重ねすぎないでください。",
    ];
  }

  if (args.detailLevel === "detailed") {
    if (args.lowFactDetailed) {
      if (args.detailPlan.name === "strict") {
        return [
          `今回の候補はやや詳しめ帯の${planLabel}です。使える事実が少ない前提なので、事実の言い換えで長くせず、置く場所か収まり方を一段だけ具体化してください。`,
          "厚みは『どこに置くか』『どう収まるか』『片づけ動作がどう楽か』のどれか一つで作り、同じ事実を head と bullet で繰り返さないでください。",
        ];
      }

      if (args.detailPlan.name === "upper_edge") {
        return [
          `今回の候補はやや詳しめ帯の${planLabel}です。低事実量でも厚みを出してよいですが、説明を盛るのではなく、置き方・収まり方・使い分けのどれか一つを自然につないでください。`,
          "別の事実を増やそうとせず、同じ事実の焼き直しにも頼らず、一段だけ場面を具体化してください。",
        ];
      }

      return [
        `今回の候補はやや詳しめ帯の${planLabel}です。使える事実が少ない前提で、使用場面と収まり方を一段だけ具体化してください。`,
        "詳しさは増やしてよいですが、同じ事実の言い換えや bullet 間の重複は避けてください。",
      ];
    }

    if (args.detailPlan.name === "strict") {
      return [
        `今回の候補はやや詳しめ帯の${planLabel}です。使用場面と扱いやすさを一段だけ具体化してください。`,
        "詳しさは増やしてよいですが、言い換えで文字数を増やさないでください。",
      ];
    }

    if (args.detailPlan.name === "upper_edge") {
      return [
        `今回の候補はやや詳しめ帯の${planLabel}です。入力材料の範囲で厚みを持たせてよいですが、説明を盛りすぎないでください。`,
        "場面・特徴・使いやすさを全部一文に詰め込まず、自然な流れを優先してください。",
      ];
    }

    return [
      `今回の候補はやや詳しめ帯の${planLabel}です。自然な日本語のまま、使用場面と扱いやすさを一段だけ具体化してください。`,
      "詳しさは増やしてよいですが、同じ内容の言い換えは避けてください。",
    ];
  }

  if (args.detailPlan.name === "strict") {
    return [
      `今回の候補は標準帯の${planLabel}です。短すぎず長すぎない密度で、必要な説明だけを残してください。`,
      "場面は一つに留め、特徴や効用を一項目に重ねすぎないでください。",
    ];
  }

  if (args.detailPlan.name === "upper_edge") {
    return [
      `今回の候補は標準帯の${planLabel}です。情報は一段だけ増やせますが、詳しめ帯のように広げすぎないでください。`,
      "各箇条書きの役割を分け、同じ価値を繰り返さないでください。",
    ];
  }

  return [
    `今回の候補は標準帯の${planLabel}です。場面と特徴の必要な分だけを自然につないでください。`,
    "過不足の少ない密度を保ち、説明を厚くしすぎないでください。",
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

function buildTemplateGuidanceLines(args: {
  templateKey: string;
  noticeReason: string;
}): string[] {
  if (args.templateKey === "product_compare") {
    return [
      "このテンプレは、商品の基本紹介に加えて、選ぶときの見方や判断材料が自然に伝わるようにするためのものです。",
      "冒頭2文では、使う場面だけでなく、どんな重視軸で選ぶと合いやすいかが少し見える入りにしてください。",
    ];
  }

  if (args.templateKey === "notice") {
    const lines = [
      "このテンプレは、理由のある案内文です。まず知らせたいことを自然に伝え、その後で商品説明を補足してください。",
      "入力にない告知事実は足さず、今回の案内理由に沿ってまとめてください。",
    ];

    if (args.noticeReason) {
      lines.push(`今回知らせたいこと: ${args.noticeReason}`);
    }

    return lines;
  }

  return [
    "このテンプレは、商品の基本情報や良さを標準的に伝える商品紹介文です。",
    "バランスを重視し、説明に偏りすぎず自然な紹介文にしてください。",
  ];
}
function buildPromptContextBlock(args: {
  normalized: NormalizedInput;
  usableFacts: AtomicFact[];
  productFactsBlock: ReturnType<typeof buildProductFactsBlock>;
  detailPlan: CandidateDetailPlan;
  lowFactDetailed: boolean;
}): string[] {
  const lines: string[] = [];
  const budget = args.detailPlan.budget;
  const detailLevel = args.detailPlan.requestedDetailLevel;
  const productName = normalizeJaText(args.normalized.product_name);
  const category = normalizeJaText(args.normalized.category);
  const audience = normalizeJaText(args.normalized.audience);
  const goal = normalizeJaText(args.normalized.goal);

  if (productName) lines.push(`商品名: ${productName}`);
  if (goal) lines.push(`入力ゴール: ${goal}`);
  if (audience) lines.push(`想定読者: ${audience}`);
  if (category) lines.push(`カテゴリ: ${category}`);

  const materialFacts = uniqueNonEmptyStrings(
    args.usableFacts
      .filter((fact) =>
        ["SPEC", "EVIDENCE", "KEYWORD", "CONSTRAINT"].includes(fact.kind),
      )
      .map((fact) => fact.text),
  ).slice(0, budget.promptContext.materialFacts);

  const referenceFacts: string[] = [];
  for (const value of args.productFactsBlock.scene.slice(0, budget.promptContext.scene)) {
    referenceFacts.push(`場面: ${value}`);
  }
  for (const value of args.productFactsBlock.value.slice(0, budget.promptContext.value)) {
    referenceFacts.push(`良さ: ${value}`);
  }
  for (const item of args.productFactsBlock.evidence.slice(0, budget.promptContext.evidence)) {
    const unit = item.unit ? item.unit : "";
    referenceFacts.push(`事実: ${item.label}: ${item.value}${unit}`);
  }
  for (const value of args.productFactsBlock.guard.slice(0, budget.promptContext.guard)) {
    referenceFacts.push(`補足: ${value}`);
  }

  if (materialFacts.length > 0) {
    lines.push("使ってよい材料:");
    for (const value of materialFacts) {
      lines.push(`- ${value}`);
    }
  }

  if (referenceFacts.length > 0) {
    lines.push("必要なら使ってよい補助情報:");
    for (const value of referenceFacts) {
      lines.push(`- ${value}`);
    }
  }

  if (detailLevel === "concise") {
    lines.push("一つの場面に必要な分だけを選び、説明を広げすぎないでください。");
    if (args.detailPlan.name === "strict") {
      lines.push("簡潔帯の下限です。補足理由や別用途を足さず、短く止めてください。");
    } else if (args.detailPlan.name === "upper_edge") {
      lines.push("簡潔帯の上限です。短い補足は一段だけに留めてください。");
    } else {
      lines.push("簡潔帯の中央です。核だけを残し、言い換えで伸ばさないでください。");
    }
    return lines;
  }

  if (detailLevel === "standard") {
    lines.push("一つの場面を軸に、特徴と扱いやすさの必要な分だけを自然につないでください。");
    if (args.detailPlan.name === "strict") {
      lines.push("標準帯の下限です。情報を足しすぎず、必要十分で止めてください。");
    } else if (args.detailPlan.name === "upper_edge") {
      lines.push("標準帯の上限です。少し厚みを足してよいですが、詳しめ帯のように広げすぎないでください。");
    } else {
      lines.push("標準帯の中央です。場面・特徴・扱いやすさの役割を分けてください。");
    }
    return lines;
  }

  if (args.lowFactDetailed) {
    lines.push("やや詳しめ帯です。使える事実が少ない前提なので、事実の焼き直しではなく、置き方・収まり方・使い分け・片づけ動作のどれか一つを一段だけ具体化してください。");
    lines.push("同じ事実を head と bullet で重ねず、bullet ごとに一項目一義を保ってください。");
    if (args.detailPlan.name === "upper_edge") {
      lines.push("厚みは増やしてよいですが、別の事実を増やそうとせず、場面の具体化だけで detailed を作ってください。");
    } else if (args.detailPlan.name === "strict") {
      lines.push("詳しさは一段だけ足し、言い換えで長くしないでください。");
    } else {
      lines.push("補助情報が乏しい場合でも、置く場所や収まり方の自然な流れを優先してください。");
    }
    return lines;
  }

  lines.push("やや詳しめ帯です。使用場面と扱いやすさを一段だけ具体化してください。");
  if (args.detailPlan.name === "upper_edge") {
    lines.push("情報は増やせますが、説明を盛るのではなく自然な流れで厚みを出してください。");
  } else if (args.detailPlan.name === "strict") {
    lines.push("詳しさは増やしてよいですが、同じ内容の言い換えで文字数を増やさないでください。");
  } else {
    lines.push("補助情報は必要な分だけ使い、観点を詰め込みすぎないでください。");
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

function buildCompareOpeningFocusLines(): string[] {
  return [
    "product_compare では、冒頭2文の早い位置で、どんな見方で選ぶと合いやすいかが少し伝わるようにしてください。",
    "比較表のように説明だけを並べるのではなく、自然な商品紹介の流れの中で選び方の視点がにじむ程度に留めてください。",
  ];
}

function buildCandidateDiversityLines(args: {
  templateKey: string;
  diversityHint: CandidateDiversityHint;
  detailLevel: DetailLevel;
}): string[] {
  const bandNote =
    args.detailLevel === "concise"
      ? "短さを壊さない範囲で入口の視点だけを変えてください。説明を増やさないでください。"
      : args.detailLevel === "detailed"
        ? "一段厚くしてよいですが、入口の視点を変えるために情報を盛りすぎないでください。"
        : "標準帯の密度を保ったまま、入口の視点だけを変えてください。";

  if (args.templateKey === "product_compare") {
    switch (args.diversityHint) {
      case "goal_first":
        return ["この候補では、入力ゴールへの整合を入口にしてください。", bandNote];
      case "scene_first":
        return ["この候補では、短い使用場面を入口にしてください。", bandNote];
      case "feature_to_scene":
        return [
          "この候補では、特徴を一つだけ入口にし、その特徴が生きる場面へ自然につないでください。",
          bandNote,
        ];
    }
  }

  switch (args.diversityHint) {
    case "goal_first":
      return ["この候補では、入力ゴールへの整合を入口にしてください。", bandNote];
    case "scene_first":
      return ["この候補では、短い使用場面を入口にしてください。", bandNote];
    case "feature_to_scene":
      return [
        "この候補では、特徴を一つだけ入口にし、その特徴が生きる場面へ自然につないでください。",
        bandNote,
      ];
  }
}


function resolveArticleTypeFromNormalized(normalized: NormalizedInput): ArticleType {
  return resolveArticleType(
    (normalized as any)?.articleType,
    normalized.meta?.articleType,
  );
}

function buildArticleTypeGuidanceLines(articleType: ArticleType): string[] {
  switch (articleType) {
    case "recommend":
      return [
        "文章タイプは『こんな人におすすめ』です。誰に向いている商品かを前面に出してください。",
        "冒頭では、商品が向いている人や使う場面を自然に示してください。単なる商品説明だけで終わらせないでください。",
        "箇条書きは『〜したい方に』『〜を探している方に』のように、おすすめ対象が分かる内容にしてください。",
      ];
    case "faq":
      return [
        "文章タイプは『よくある質問』です。購入前の疑問に答えるQ&A形式で書いてください。",
        "出力は Q. と A. の3組だけにしてください。通常の商品説明文や箇条書きにはしないでください。",
        "各回答は、入力にある事実の範囲で自然に答えてください。商品名は少なくとも1回は原文のまま入れてください。",
      ];
    case "announcement":
      return [
        "文章タイプは『新商品・入荷案内』です。新しく登場した、または入荷したことを伝える案内文にしてください。",
        "冒頭では、商品名と入荷・登場の案内感が分かるようにしてください。単なる通常の商品説明だけで終わらせないでください。",
        "箇条書きは、新生活・季節の買い替え・新入荷のお知らせとして読みやすい要点にしてください。",
      ];
    default:
      return [
        "文章タイプは『商品ページ用』です。商品ページにそのまま載せやすい標準的な商品紹介文にしてください。",
        "冒頭2文と箇条書き3点で、用途・特徴・扱いやすさを自然につないでください。",
      ];
  }
}

function buildFaqShapeBlock(): string[] {
  return [
    "出力形式は、Q. と A. の3組だけです。",
    "見出し、前置き、箇条書き、まとめ文は書かないでください。",
    "各Qは購入前に気になる自然な疑問にしてください。",
    "各Aは1〜2文で、入力にある情報だけを使って答えてください。",
  ];
}

function buildProseUser(args: {
  normalized: NormalizedInput;
  usableFacts: AtomicFact[];
  diversityHint: CandidateDiversityHint;
  productFactsBlock: ReturnType<typeof buildProductFactsBlock>;
  templateKey: string;
  noticeReason: string;
  detailLevel: DetailLevel;
  detailPlan: CandidateDetailPlan;
  articleType: ArticleType;
}): string {
  const lowFactDetailed = isLowFactDetailedContext({
    detailPlan: args.detailPlan,
    usableFacts: args.usableFacts,
    productFactsBlock: args.productFactsBlock,
  });
  const productName = normalizeJaText(args.normalized.product_name);
  const templateGuidanceLines = buildTemplateGuidanceLines({
    templateKey: args.templateKey,
    noticeReason: args.noticeReason,
  });
  const diversityLines = buildCandidateDiversityLines({
    templateKey: args.templateKey,
    diversityHint: args.diversityHint,
    detailLevel: args.detailLevel,
  });
  const compareOpeningFocusLines =
    args.templateKey === "product_compare"
      ? buildCompareOpeningFocusLines()
      : [];
  const articleTypeGuidanceLines = buildArticleTypeGuidanceLines(args.articleType);

  const promptLines =
    args.articleType === "faq"
      ? [
          ...articleTypeGuidanceLines,
          ...buildFaqShapeBlock(),
          ...buildDetailGuidanceBlock({
            detailLevel: args.detailLevel,
            detailPlan: args.detailPlan,
            lowFactDetailed,
          }),
          ...buildMinimalSafetyLines(),
          ...templateGuidanceLines,
          ...diversityLines,
          ...buildPromptContextBlock({
            normalized: args.normalized,
            usableFacts: args.usableFacts,
            productFactsBlock: args.productFactsBlock,
            detailPlan: args.detailPlan,
            lowFactDetailed,
          }),
        ]
      : args.templateKey === "product_compare"
        ? [
            ...buildHeadFirstHardFloorBlock({ productName }),
            ...articleTypeGuidanceLines,
            ...templateGuidanceLines,
            ...compareOpeningFocusLines,
            ...buildMinimalSceneHandoffBlock(),
            ...buildBodyShapeBlock(),
            ...buildDetailGuidanceBlock({
              detailLevel: args.detailLevel,
              detailPlan: args.detailPlan,
              lowFactDetailed,
            }),
            ...buildMinimalSafetyLines(),
            ...diversityLines,
            ...buildPromptContextBlock({
              normalized: args.normalized,
              usableFacts: args.usableFacts,
              productFactsBlock: args.productFactsBlock,
              detailPlan: args.detailPlan,
              lowFactDetailed,
            }),
          ]
        : [
            ...buildHeadFirstHardFloorBlock({ productName }),
            ...articleTypeGuidanceLines,
            ...buildMinimalSceneHandoffBlock(),
            ...buildBodyShapeBlock(),
            ...buildDetailGuidanceBlock({
              detailLevel: args.detailLevel,
              detailPlan: args.detailPlan,
              lowFactDetailed,
            }),
            ...buildMinimalSafetyLines(),
            ...templateGuidanceLines,
            ...diversityLines,
            ...buildPromptContextBlock({
              normalized: args.normalized,
              usableFacts: args.usableFacts,
              productFactsBlock: args.productFactsBlock,
              detailPlan: args.detailPlan,
              lowFactDetailed,
            }),
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


function countVisibleTextChars(text: string): number {
  return (text ?? "")
    .toString()
    .replace(/\r\n/g, "\n")
    .replace(/^[・\-]\s*/gm, "")
    .replace(/\s+/g, "")
    .length;
}

function detectCandidateDetailBand(profile: {
  totalChars: number;
  averageBulletChars: number;
}): CandidateDetailBand {
  if (
    (profile.totalChars <= 146 && profile.averageBulletChars <= 19) ||
    (profile.totalChars <= 136 && profile.averageBulletChars <= 21)
  ) {
    return "concise";
  }

  if (
    profile.totalChars >= 186 ||
    profile.averageBulletChars >= 32 ||
    (profile.totalChars >= 170 && profile.averageBulletChars >= 27)
  ) {
    return "detailed";
  }

  return "standard";
}

function computeDetailAlignmentScore(
  detailBudget: DetailBudget,
  profile: {
    totalChars: number;
    averageBulletChars: number;
  },
): number {
  const totalPenalty = Math.abs(
    profile.totalChars - detailBudget.selection.targetTotalChars,
  );
  const bulletPenalty =
    Math.abs(
      profile.averageBulletChars -
        detailBudget.selection.targetBulletAverageChars,
    ) * 3;

  return Math.max(0, 100 - totalPenalty - bulletPenalty);
}

function buildCandidateDetailProfile(
  text: string,
  detailPlan: CandidateDetailPlan,
): CandidateDetailProfile {
  const { head, body } = splitHeadAndBody(text);
  const bulletLines = collectBulletLines(body).map((line) =>
    line.replace(/^[・\-]\s*/, "").trim(),
  );
  const headChars = countVisibleTextChars(head);
  const bulletChars = bulletLines.reduce(
    (sum, line) => sum + countVisibleTextChars(line),
    0,
  );
  const bulletCount = bulletLines.length;
  const averageBulletChars =
    bulletCount > 0 ? Math.round(bulletChars / bulletCount) : 0;
  const totalChars = headChars + bulletChars;
  const band = detectCandidateDetailBand({ totalChars, averageBulletChars });

  return {
    totalChars,
    headChars,
    bulletChars,
    bulletCount,
    averageBulletChars,
    band,
    alignmentScore: computeDetailAlignmentScore(detailPlan.budget, {
      totalChars,
      averageBulletChars,
    }),
    requestedDetailLevel: detailPlan.requestedDetailLevel,
    requestedPlanName: detailPlan.name,
    isInRequestedBand: isInRequestedDetailBand(
      band,
      detailPlan.requestedDetailLevel,
    ),
  };
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

function detectSourceRestatementHits(
  textPart: string,
  normalized: NormalizedInput,
): Array<{
  fragment: string;
  normalizedFragment: string;
  occurrences: number;
  lineHits: number;
}> {
  const target = normalizeBoundaryMatchText(textPart);
  if (!target) return [];

  const lines = (textPart ?? "")
    .toString()
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/^[・\-]\s*/, "").trim())
    .filter(Boolean)
    .map((line) => normalizeBoundaryMatchText(line));

  const hits: Array<{
    fragment: string;
    normalizedFragment: string;
    occurrences: number;
    lineHits: number;
  }> = [];

  for (const fragment of collectRestatementSourceFragments(normalized)) {
    const normalizedFragment = normalizeBoundaryMatchText(fragment);
    if (!normalizedFragment) continue;

    const occurrences = countNormalizedOccurrences(textPart, fragment);
    if (occurrences <= 0) continue;

    const lineHits = lines.filter((line) =>
      line.includes(normalizedFragment),
    ).length;

    hits.push({
      fragment,
      normalizedFragment,
      occurrences,
      lineHits,
    });
  }

  return hits;
}

function hasHeadDirectSourceRestatement(
  head: string,
  normalized: NormalizedInput,
): boolean {
  const hits = detectSourceRestatementHits(head, normalized);
  if (hits.length === 0) return false;

  const normalizedHead = normalizeBoundaryMatchText(head);
  if (!normalizedHead) return false;

  const normalizedGoal = normalizeBoundaryMatchText(normalized.goal);
  const headSentences = extractHeadSentences(head);
  const headValue = normalizeJaText(head);
  const hasSceneConnection = /(とき|場面|途中|朝|午後|夜|机|デスク|自宅|オフィス|洗面所|クローゼット|屋外|イベント|通勤|置い|持ち歩|手に取|使う|使え|整え|しまえ|収め|休憩|移動中)/.test(
    headValue,
  );

  return hits.some((hit) => {
    const targetLen = normalizedHead.length;
    const fragmentLen = hit.normalizedFragment.length;
    const remainder = normalizedHead.replace(hit.normalizedFragment, "");
    const remainderLen = remainder.length;
    const fragmentRatio = fragmentLen / Math.max(targetLen, 1);
    const repeated = hit.occurrences >= 2;
    const goalAnchored =
      normalizedGoal.length > 0 &&
      (normalizedGoal.includes(hit.normalizedFragment) ||
        hit.normalizedFragment.includes(normalizedGoal));

    const sentenceNearCopy = headSentences.some((sentence) => {
      const normalizedSentence = normalizeBoundaryMatchText(sentence);
      if (!normalizedSentence.includes(hit.normalizedFragment)) return false;

      const sentenceRemainder = normalizedSentence.replace(
        hit.normalizedFragment,
        "",
      );
      const sentenceRatio =
        hit.normalizedFragment.length / Math.max(normalizedSentence.length, 1);

      if (sentenceRemainder.length <= 18) return true;
      if (sentenceRatio >= 0.62 && sentenceRemainder.length <= 28) return true;
      if (goalAnchored && sentenceRatio >= 0.5 && sentenceRemainder.length <= 34) {
        return true;
      }

      return false;
    });

    const dominantNearCopy = fragmentRatio >= 0.5 && remainderLen <= 28;
    const weaklyExpanded = goalAnchored && !hasSceneConnection && remainderLen <= 34;

    return repeated || sentenceNearCopy || dominantNearCopy || weaklyExpanded;
  });
}

function hasBodyDenseSourceRestatement(
  body: string,
  normalized: NormalizedInput,
): boolean {
  const hits = detectSourceRestatementHits(body, normalized);
  if (hits.length === 0) return false;

  const bulletContents = collectBulletLines(body).map((line) =>
    line.replace(/^[・\-]\s*/, "").trim(),
  );
  const normalizedGoal = normalizeBoundaryMatchText(normalized.goal);

  return hits.some((hit) => {
    const goalAnchored =
      normalizedGoal.length > 0 &&
      (normalizedGoal.includes(hit.normalizedFragment) ||
        hit.normalizedFragment.includes(normalizedGoal));

    if (!goalAnchored) {
      return hit.lineHits >= 2 || hit.occurrences >= 3;
    }

    if (hit.lineHits >= 2) return true;
    if (hit.occurrences >= 2) return true;

    const nearCopyBulletHits = bulletContents.filter((line) => {
      const normalizedLine = normalizeBoundaryMatchText(line);
      if (!normalizedLine.includes(hit.normalizedFragment)) return false;

      const remainder = normalizedLine.replace(hit.normalizedFragment, "");
      const ratio = hit.normalizedFragment.length / Math.max(normalizedLine.length, 1);
      const lineValue = normalizeJaText(line);
      const hasExpansionCue = /(ため|ので|から|ながら|つつ|やすい|しやすい|できる|でき|合わせ|使い分け|収め|整え|まとめ|置き方|工夫|立体的|無駄なく|保ちやすい)/.test(
        lineValue,
      );

      if (remainder.length <= 12) return true;
      if (ratio >= 0.6 && remainder.length <= 20) return true;
      if (remainder.length <= 20 && !hasExpansionCue) return true;
      return false;
    }).length;

    return nearCopyBulletHits >= 1;
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

function getAudiencePlacementStats(
  head: string,
  body: string,
  normalized: NormalizedInput,
): {
  audience: string;
  headCount: number;
  bodyCount: number;
} {
  const audience = normalizeJaText(normalized.audience);
  if (!audience) {
    return {
      audience: "",
      headCount: 0,
      bodyCount: 0,
    };
  }

  return {
    audience,
    headCount: countNormalizedOccurrences(head, audience),
    bodyCount: countNormalizedOccurrences(body, audience),
  };
}

function hasAudiencePlacementViolation(
  head: string,
  body: string,
  normalized: NormalizedInput,
): boolean {
  const stats = getAudiencePlacementStats(head, body, normalized);
  if (!stats.audience) return false;

  if (stats.bodyCount > 0) return true;
  if (stats.headCount > 1) return true;
  return false;
}

function collectFaqLines(text: string): { qLines: string[]; aLines: string[] } {
  const lines = (text ?? "")
    .toString()
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    qLines: lines.filter((line) => /^Q[.．]/i.test(line)),
    aLines: lines.filter((line) => /^A[.．]/i.test(line)),
  };
}

function evaluateFaqCandidateBoundary(
  text: string,
  normalized: NormalizedInput,
): FinalProseBoundaryResult {
  const reasons: string[] = [];
  const warnings = buildBoundaryWarnings(text, normalized);
  const placeholderLeakageHits = detectPlaceholderLeakage(text);
  const productName = normalizeJaText(normalized.product_name);
  const { qLines, aLines } = collectFaqLines(text);

  if (qLines.length !== 3 || aLines.length !== 3) {
    reasons.push("FAQ_PAIR_COUNT");
  }

  if (!productName || !text.includes(productName)) {
    reasons.push("FAQ_MISSING_PRODUCT_NAME");
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

function evaluateCandidateSelectionBoundary(
  text: string,
  normalized: NormalizedInput,
): FinalProseBoundaryResult {
  if (resolveArticleTypeFromNormalized(normalized) === "faq") {
    return evaluateFaqCandidateBoundary(text, normalized);
  }

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
  if (resolveArticleTypeFromNormalized(normalized) === "faq") {
    return base;
  }

  const reasons = [...base.reasons];

  const { head, body } = splitHeadAndBody(text);

  if (hasHeadAbstractPromotion(head)) {
    reasons.push("HEAD_ABSTRACT_PROMOTION");
  }

  if (hasPurposeMisalignment(text, normalized)) {
    reasons.push("PURPOSE_NOT_ALIGNED");
  }

  if (hasHeadDirectSourceRestatement(head, normalized)) {
    reasons.push("HEAD_SOURCE_RESTATEMENT");
  }

  if (hasBodyDenseSourceRestatement(body, normalized)) {
    reasons.push("BODY_SOURCE_RESTATEMENT");
  }

  if (hasAudiencePlacementViolation(head, body, normalized)) {
    reasons.push("AUDIENCE_NOT_EXACT_ONCE_IN_HEAD");
  }

  const uniqueReasons = Array.from(new Set(reasons));
  const score = Math.max(
    0,
    100 - uniqueReasons.length * 25 - base.warnings.length * 5,
  );

  return {
    ok: uniqueReasons.length === 0,
    reasons: uniqueReasons,
    score,
    warnings: base.warnings,
  };
}


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
  detailPlan: CandidateDetailPlan;
  content: string;
  apiMs: number;
  status: number;
  statusText: string;
  minimalBoundary: FinalProseBoundaryResult;
  richerBoundary: FinalProseBoundaryResult;
  detailProfile: CandidateDetailProfile;
  audiencePlacementStats: {
    audience: string;
    headCount: number;
    bodyCount: number;
  };
  lowFactDetailed: boolean;
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

type FallbackSelectionHints = {
  aiJudgeAttempted: boolean;
  aiJudgePreferredIndex: number | null;
  aiJudgeRejectedIndexes: number[];
};

function buildFallbackSelectionHints(args: {
  aiJudgeAttempted: boolean;
  aiSelectedIndex: number | null;
  aiRejectedCandidates: CandidateAiJudgeRejected[];
}): FallbackSelectionHints {
  return {
    aiJudgeAttempted: args.aiJudgeAttempted,
    aiJudgePreferredIndex:
      typeof args.aiSelectedIndex === "number" &&
      Number.isFinite(args.aiSelectedIndex)
        ? args.aiSelectedIndex
        : null,
    aiJudgeRejectedIndexes: Array.from(
      new Set(
        args.aiRejectedCandidates
          .map((item) => item.candidateIndex)
          .filter((value) => Number.isFinite(value)),
      ),
    ),
  };
}

function candidateMatchesFallbackPreferredIndex(
  candidate: CandidateRecord,
  hints: FallbackSelectionHints,
): boolean {
  return (
    hints.aiJudgePreferredIndex !== null &&
    candidate.candidateIndex === hints.aiJudgePreferredIndex
  );
}

function candidateWasRejectedByFallbackHints(
  candidate: CandidateRecord,
  hints: FallbackSelectionHints,
): boolean {
  return hints.aiJudgeRejectedIndexes.includes(candidate.candidateIndex);
}


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


function buildAiJudgeCandidatePool(args: {
  candidates: CandidateRecord[];
  detailLevel: DetailLevel;
}): { pool: CandidateRecord[]; inBandOnlyApplied: boolean } {
  return {
    pool: [...args.candidates].sort(
      (a, b) => a.candidateIndex - b.candidateIndex,
    ),
    inBandOnlyApplied: false,
  };
}



function resolveDetailBandOrder(
  band: DetailLevel | CandidateDetailBand,
): number {
  switch (band) {
    case "concise":
      return 0;
    case "standard":
      return 1;
    default:
      return 2;
  }
}

function computeRequestedBandDistance(args: {
  requestedDetailLevel: DetailLevel;
  band: CandidateDetailBand;
}): number {
  return Math.abs(
    resolveDetailBandOrder(args.requestedDetailLevel) -
      resolveDetailBandOrder(args.band),
  );
}


function compareFallbackCandidates(args: {
  current: CandidateRecord | null;
  next: CandidateRecord;
  detailLevel: DetailLevel;
  hints: FallbackSelectionHints;
}): CandidateRecord {
  const { current, next, detailLevel, hints } = args;
  if (!current) return next;

  const currentPreferred = candidateMatchesFallbackPreferredIndex(current, hints);
  const nextPreferred = candidateMatchesFallbackPreferredIndex(next, hints);
  if (currentPreferred !== nextPreferred) {
    return nextPreferred ? next : current;
  }

  const currentRejected = candidateWasRejectedByFallbackHints(current, hints);
  const nextRejected = candidateWasRejectedByFallbackHints(next, hints);
  if (currentRejected !== nextRejected) {
    return nextRejected ? current : next;
  }

  if (next.richerBoundary.ok !== current.richerBoundary.ok) {
    return next.richerBoundary.ok ? next : current;
  }

  const currentPurposePenalty = candidateHasRicherReason(
    current,
    "PURPOSE_NOT_ALIGNED",
  );
  const nextPurposePenalty = candidateHasRicherReason(
    next,
    "PURPOSE_NOT_ALIGNED",
  );
  if (currentPurposePenalty !== nextPurposePenalty) {
    return nextPurposePenalty ? current : next;
  }

  const currentRestatementPenalty = candidateHasRicherReason(
    current,
    "BODY_SOURCE_RESTATEMENT",
  );
  const nextRestatementPenalty = candidateHasRicherReason(
    next,
    "BODY_SOURCE_RESTATEMENT",
  );
  if (currentRestatementPenalty !== nextRestatementPenalty) {
    return nextRestatementPenalty ? current : next;
  }

  if (
    next.richerBoundary.reasons.length !== current.richerBoundary.reasons.length
  ) {
    return next.richerBoundary.reasons.length <
      current.richerBoundary.reasons.length
      ? next
      : current;
  }

  if (
    next.richerBoundary.warnings.length !== current.richerBoundary.warnings.length
  ) {
    return next.richerBoundary.warnings.length <
      current.richerBoundary.warnings.length
      ? next
      : current;
  }

  const currentBandDistance = computeRequestedBandDistance({
    requestedDetailLevel: detailLevel,
    band: current.detailProfile.band,
  });
  const nextBandDistance = computeRequestedBandDistance({
    requestedDetailLevel: detailLevel,
    band: next.detailProfile.band,
  });
  if (currentBandDistance !== nextBandDistance) {
    return nextBandDistance < currentBandDistance ? next : current;
  }

  if (
    next.detailProfile.alignmentScore !== current.detailProfile.alignmentScore
  ) {
    return next.detailProfile.alignmentScore >
      current.detailProfile.alignmentScore
      ? next
      : current;
  }

  if (next.richerBoundary.score !== current.richerBoundary.score) {
    return next.richerBoundary.score > current.richerBoundary.score
      ? next
      : current;
  }

  if (
    next.minimalBoundary.reasons.length !== current.minimalBoundary.reasons.length
  ) {
    return next.minimalBoundary.reasons.length <
      current.minimalBoundary.reasons.length
      ? next
      : current;
  }

  if (
    next.minimalBoundary.warnings.length !== current.minimalBoundary.warnings.length
  ) {
    return next.minimalBoundary.warnings.length <
      current.minimalBoundary.warnings.length
      ? next
      : current;
  }

  if (next.minimalBoundary.score !== current.minimalBoundary.score) {
    return next.minimalBoundary.score > current.minimalBoundary.score
      ? next
      : current;
  }

  return next.candidateIndex < current.candidateIndex ? next : current;
}


function selectFallbackCandidate(
  candidates: CandidateRecord[],
  detailLevel: DetailLevel,
  hints: FallbackSelectionHints,
): CandidateRecord | null {
  let best: CandidateRecord | null = null;

  for (const candidate of candidates) {
    best = compareFallbackCandidates({
      current: best,
      next: candidate,
      detailLevel,
      hints,
    });
  }

  return best;
}


function selectBestAlternativeCandidate(
  candidates: CandidateRecord[],
  selectedCandidateIndex: number,
  detailLevel: DetailLevel,
  hints: FallbackSelectionHints,
): CandidateRecord | null {
  return selectFallbackCandidate(
    candidates.filter(
      (candidate) => candidate.candidateIndex !== selectedCandidateIndex,
    ),
    detailLevel,
    {
      ...hints,
      aiJudgePreferredIndex:
        hints.aiJudgePreferredIndex === selectedCandidateIndex
          ? null
          : hints.aiJudgePreferredIndex,
      aiJudgeRejectedIndexes: hints.aiJudgeRejectedIndexes.filter(
        (candidateIndex) => candidateIndex !== selectedCandidateIndex,
      ),
    },
  );
}


function candidateHasRicherReason(candidate: CandidateRecord, reason: string): boolean {
  return candidate.richerBoundary.reasons.includes(reason);
}




type BoundaryHandoffSummary = {
  hardFailReasons: string[];
  strongPenaltyReasons: string[];
  advisoryWarnings: string[];
};

const BOUNDARY_STRONG_PENALTY_REASONS = new Set<string>([
  "PURPOSE_NOT_ALIGNED",
  "HEAD_SOURCE_RESTATEMENT",
  "BODY_SOURCE_RESTATEMENT",
  "AUDIENCE_NOT_EXACT_ONCE_IN_HEAD",
]);

function buildBoundaryHandoffSummary(
  candidate: CandidateRecord,
): BoundaryHandoffSummary {
  const hardFailReasons = Array.from(new Set(candidate.minimalBoundary.reasons));

  const strongPenaltyReasons = Array.from(
    new Set(
      candidate.richerBoundary.reasons.filter((reason) => {
        if (!BOUNDARY_STRONG_PENALTY_REASONS.has(reason)) return false;

        if (
          reason === "BODY_SOURCE_RESTATEMENT" &&
          candidate.lowFactDetailed &&
          candidate.detailPlan.requestedDetailLevel === "detailed" &&
          candidate.detailProfile.isInRequestedBand
        ) {
          return false;
        }

        if (
          reason === "AUDIENCE_NOT_EXACT_ONCE_IN_HEAD" &&
          !audienceLeakIsStrong
        ) {
          return false;
        }

        return true;
      }),
    ),
  );

  const audienceLeakIsStrong =
    candidate.richerBoundary.reasons.includes(
      "AUDIENCE_NOT_EXACT_ONCE_IN_HEAD",
    ) &&
    (candidate.audiencePlacementStats.bodyCount > 0 ||
      candidate.audiencePlacementStats.headCount > 1);

  const advisoryWarnings = Array.from(
    new Set([
      ...candidate.minimalBoundary.warnings,
      ...candidate.richerBoundary.warnings,
      ...candidate.richerBoundary.reasons.filter((reason) => {
        if (hardFailReasons.includes(reason)) return false;
        if (strongPenaltyReasons.includes(reason)) return false;
        if (reason === "BODY_SOURCE_RESTATEMENT") {
          return (
            candidate.lowFactDetailed &&
            candidate.detailPlan.requestedDetailLevel === "detailed"
          );
        }
        return false;
      }),
    ]),
  );

  return {
    hardFailReasons,
    strongPenaltyReasons,
    advisoryWarnings,
  };
}

function candidateHasHardFail(candidate: CandidateRecord): boolean {
  return candidate.minimalBoundary.reasons.length > 0;
}

function candidateHasStrongPenalty(candidate: CandidateRecord): boolean {
  return buildBoundaryHandoffSummary(candidate).strongPenaltyReasons.length > 0;
}

function shouldRejectStandardOutOfBandSelection(args: {
  candidates: CandidateRecord[];
  selectedCandidate: CandidateRecord;
  detailLevel: DetailLevel;
}): boolean {
  if (args.detailLevel !== "standard") return false;
  if (args.selectedCandidate.detailProfile.isInRequestedBand) return false;

  const inBandCandidates = args.candidates.filter(
    (candidate) => candidate.detailProfile.isInRequestedBand,
  );
  if (inBandCandidates.length === 0) return false;

  return inBandCandidates.some(
    (candidate) =>
      !candidateHasHardFail(candidate) && !candidateHasStrongPenalty(candidate),
  );
}

function validateAiJudgeSelection(args: {
  candidates: CandidateRecord[];
  selectedCandidate: CandidateRecord;
  decision: CandidateAiJudgeDecision;
  detailLevel: DetailLevel;
}): { ok: boolean; message?: string; meta?: Record<string, unknown> } {
  const candidateIndexes = new Set(
    args.candidates.map((candidate) => candidate.candidateIndex),
  );

  if (!candidateIndexes.has(args.selectedCandidate.candidateIndex)) {
    return {
      ok: false,
      message: "ai candidate judge selected candidate outside provided pool",
      meta: {
        selectedCandidateIndex: args.selectedCandidate.candidateIndex,
        candidateIndexes: Array.from(candidateIndexes),
      },
    };
  }

  if (!args.selectedCandidate.minimalBoundary.ok) {
    return {
      ok: false,
      message: "ai candidate judge selected candidate that did not pass minimal boundary",
      meta: {
        selectedCandidateIndex: args.selectedCandidate.candidateIndex,
        minimalReasons: args.selectedCandidate.minimalBoundary.reasons,
      },
    };
  }

  const validMarks: CandidateAiJudgeDecisionMark[] = ["best", "tie", "override"];
  if (
    !validMarks.includes(args.decision.goalAlignment) ||
    !validMarks.includes(args.decision.naturalJapanese) ||
    !validMarks.includes(args.decision.sceneConcreteness)
  ) {
    return {
      ok: false,
      message: "ai candidate judge decision marks were invalid",
      meta: {
        selectedCandidateIndex: args.selectedCandidate.candidateIndex,
        decision: args.decision,
      },
    };
  }

  if (
    typeof args.decision.restatementPenaltyUsed !== "boolean" ||
    typeof args.decision.overrideUsed !== "boolean"
  ) {
    return {
      ok: false,
      message: "ai candidate judge decision booleans were invalid",
      meta: {
        selectedCandidateIndex: args.selectedCandidate.candidateIndex,
        decision: args.decision,
      },
    };
  }

  if (
    shouldRejectStandardOutOfBandSelection({
      candidates: args.candidates,
      selectedCandidate: args.selectedCandidate,
      detailLevel: args.detailLevel,
    })
  ) {
    return {
      ok: false,
      message:
        "ai candidate judge selected out-of-band candidate even though a standard in-band candidate without strong penalties existed",
      meta: {
        selectedCandidateIndex: args.selectedCandidate.candidateIndex,
        selectedBand: args.selectedCandidate.detailProfile.band,
        requestedDetailLevel: args.detailLevel,
        inBandCandidates: args.candidates
          .filter((candidate) => candidate.detailProfile.isInRequestedBand)
          .map((candidate) => ({
            candidateIndex: candidate.candidateIndex,
            hardFailReasons: buildBoundaryHandoffSummary(candidate)
              .hardFailReasons,
            strongPenaltyReasons: buildBoundaryHandoffSummary(candidate)
              .strongPenaltyReasons,
          })),
      },
    };
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
    requestedDetailLevel: args.candidate.detailPlan.requestedDetailLevel,
    candidateDetailPlan: args.candidate.detailPlan.name,
    isInRequestedBand: args.candidate.detailProfile.isInRequestedBand,
    minimalScore: args.candidate.minimalBoundary.score,
    minimalReasons: args.candidate.minimalBoundary.reasons,
    minimalWarnings: args.candidate.minimalBoundary.warnings,
    richerScore: args.candidate.richerBoundary.score,
    richerReasons: args.candidate.richerBoundary.reasons,
    richerWarnings: args.candidate.richerBoundary.warnings,
    detailBand: args.candidate.detailProfile.band,
    detailAlignmentScore: args.candidate.detailProfile.alignmentScore,
    totalChars: args.candidate.detailProfile.totalChars,
    averageBulletChars: args.candidate.detailProfile.averageBulletChars,
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
  detailPlan: CandidateDetailPlan;
  response: {
    content: string;
    apiMs: number;
    status: number;
    statusText: string;
  };
  proseUser: string;
  normalized: NormalizedInput;
  lowFactDetailed: boolean;
}): CandidateRecord {
  const { head, body } = splitHeadAndBody(args.response.content);
  return {
    passKind: args.passKind,
    candidateIndex: args.candidateIndex,
    diversityHint: args.diversityHint,
    detailPlan: args.detailPlan,
    content: args.response.content,
    apiMs: args.response.apiMs,
    status: args.response.status,
    statusText: args.response.statusText,
    minimalBoundary: evaluateCandidateSelectionBoundary(
      args.response.content,
      args.normalized,
    ),
    richerBoundary: evaluateFinalProseBoundary(args.response.content, args.normalized),
    detailProfile: buildCandidateDetailProfile(args.response.content, args.detailPlan),
    audiencePlacementStats: getAudiencePlacementStats(head, body, args.normalized),
    lowFactDetailed: args.lowFactDetailed,
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
  atomicFacts: AtomicFact[];
  productFactsBlock: ReturnType<typeof buildProductFactsBlock>;
  templateKey: string;
  noticeReason: string;
  detailLevel: DetailLevel;
  articleType: ArticleType;
  passKind: CandidatePassKind;
  candidateIndex: number;
}): Promise<CandidateRecord | null> {
  const diversityHint = resolveCandidateDiversityHint(args.candidateIndex);
  const detailPlan = resolveCandidateDetailPlan(
    args.detailLevel,
    args.candidateIndex,
  );
  const usableFacts = buildUsableFactsForRenderer(args.atomicFacts, detailPlan);
  const lowFactDetailed = isLowFactDetailedContext({
    detailPlan,
    usableFacts,
    productFactsBlock: args.productFactsBlock,
  });
  const proseUser = buildProseUser({
    normalized: args.normalized,
    usableFacts,
    diversityHint,
    productFactsBlock: args.productFactsBlock,
    templateKey: args.templateKey,
    noticeReason: args.noticeReason,
    detailLevel: args.detailLevel,
    detailPlan,
    articleType: args.articleType,
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
    detailPlan,
    response: initialResponse,
    proseUser,
    normalized: args.normalized,
    lowFactDetailed,
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
    detailPlan,
    response: rescueResponse,
    proseUser: rescueUser,
    normalized: args.normalized,
    lowFactDetailed,
  });

  const selectedCandidate = chooseBetterShapeCandidate(
    initialCandidate,
    rescueCandidate,
  );

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
    candidateDetailPlan: detailPlan.name,
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
  atomicFacts: AtomicFact[];
  productFactsBlock: ReturnType<typeof buildProductFactsBlock>;
  templateKey: string;
  noticeReason: string;
  detailLevel: DetailLevel;
  articleType: ArticleType;
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
      atomicFacts: args.atomicFacts,
      productFactsBlock: args.productFactsBlock,
      templateKey: args.templateKey,
      noticeReason: args.noticeReason,
      detailLevel: args.detailLevel,
      articleType: args.articleType,
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
    "候補はすべて minimal pass 済みです。意味比較を行い、最も良い候補を1つ選んでください。",
    "比較の優先順位は、HARD_FAIL 回避 → requested detail 適合 → 入力ゴール整合 → 自然な日本語 → 使用場面の具体性 → strong penalty の少なさ → advisory の少なさ、です。",
    "requested detail が standard の場合、in-band 候補が1本でもあるなら、out-of-band 候補を勝たせるには in-band 候補側に strong penalty が必要です。『少し自然』『少し具体的』だけでは override してはいけません。",
    "PURPOSE_NOT_ALIGNED は strong penalty です。他候補にも同等以上の strong penalty がある場合を除き、基本は避けてください。",
    "HEAD_SOURCE_RESTATEMENT と BODY_SOURCE_RESTATEMENT は、strong penalty として渡された場合に限って重く扱ってください。単なる事実利用や軽い source reuse は advisory に留めてください。",
    "low-fact detailed では、置き方・収まり方・使い分けの一段展開がある候補を、単なる事実の焼き直しとは区別してください。BODY_SOURCE_RESTATEMENT が advisory なら、それだけで落とさないでください。",
    "AUDIENCE_NOT_EXACT_ONCE_IN_HEAD が advisory として渡された場合、単独では落選理由にしないでください。同点比較の補助信号としてのみ使ってください。",
    "detail の帯だけで勝者を決めないでください。ただし standard request では帯逸脱を甘く扱わないでください。",
    'decision の各項目は "best" / "tie" / "override" のいずれかを入れてください。',
    "override は、診断上の不利を乗り越える明確な理由がある場合だけ使ってください。standard request で in-band 候補が健全な場合、override は使わないでください。",
    "rejected は任意です。書く場合は、選ばなかった候補の主要な負け筋だけを短く入れてください。",
    "返答は JSON のみです。前置き、補足、コードフェンスは不要です。",
    `返答形式は必ず {"selectedCandidateIndex": number, "decision": {"goalAlignment": "best|tie|override", "naturalJapanese": "best|tie|override", "sceneConcreteness": "best|tie|override", "restatementPenaltyUsed": boolean, "overrideUsed": boolean}, "reason": string, "rejected": [{"candidateIndex": number, "mainReason": string}]} の形にしてください。`,
  ].join("\n");
}

function buildRequestedDetailExpectationLines(
  detailLevel: DetailLevel,
): string[] {
  if (detailLevel === "concise") {
    return [
      "requested detail expectation:",
      "- 同じ shape の中で最も薄い版であること",
      "- HEAD2 は入口の続きだけに留めること",
      "- 箇条書きは一項目一義で、理由や別用途を重ねないこと",
    ];
  }

  if (detailLevel === "detailed") {
    return [
      "requested detail expectation:",
      "- 標準帯より一段だけ厚いこと",
      "- 置き方・扱いやすさ・使い分けのどれか一つを自然に足せていること",
      "- 長いだけ、言い換えだけになっていないこと",
    ];
  }

  return [
    "requested detail expectation:",
    "- 過不足の少ない標準帯であること",
    "- 場面と特徴・扱いやすさが一段だけ自然につながっていること",
  ];
}

function formatCandidateBoundaryList(values: string[]): string {
  const items = uniqueNonEmptyStrings(values);
  return items.length > 0 ? items.join(", ") : "none";
}

function buildAiSelectionJudgeUser(args: {
  normalized: NormalizedInput;
  candidates: CandidateRecord[];
  detailLevel: DetailLevel;
}): string {
  const lines: string[] = [
    "以下は最小外形条件を通過した候補です。最も良い候補を1つだけ選んでください。",
    "比較の優先順位:",
    "- HARD_FAIL を避ける",
    "- requested detail を守る（特に standard）",
    "- 入力ゴールとの整合を最優先する",
    "- 日本語として自然で読みやすい",
    "- 使用場面が具体的に読める",
    "- strong penalty が少ない",
    "- advisory は同点近辺の補助だけに使う",
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
  lines.push(`requested detail: ${args.detailLevel}`);
  lines.push(...buildRequestedDetailExpectationLines(args.detailLevel));
  lines.push("");

  for (const candidate of args.candidates) {
    const handoff = buildBoundaryHandoffSummary(candidate);

    lines.push(`候補 ${candidate.candidateIndex}:`);
    lines.push(candidate.content);
    lines.push("診断情報:");
    lines.push(
      `- hard fail reasons: ${formatCandidateBoundaryList(
        handoff.hardFailReasons,
      )}`,
    );
    lines.push(
      `- strong penalty reasons: ${formatCandidateBoundaryList(
        handoff.strongPenaltyReasons,
      )}`,
    );
    lines.push(
      `- advisory warnings: ${formatCandidateBoundaryList(
        handoff.advisoryWarnings,
      )}`,
    );
    lines.push(
      `- detail profile: band=${candidate.detailProfile.band}, inRequestedBand=${candidate.detailProfile.isInRequestedBand}, requestedPlan=${candidate.detailProfile.requestedPlanName}, lowFactDetailed=${candidate.lowFactDetailed}, totalChars=${candidate.detailProfile.totalChars}, averageBulletChars=${candidate.detailProfile.averageBulletChars}, alignmentScore=${candidate.detailProfile.alignmentScore}`,
    );
    lines.push("");
  }

  lines.push(
    `selectedCandidateIndex には、候補番号 ${args.candidates
      .map((candidate) => candidate.candidateIndex)
      .join(", ")} のいずれかを入れてください。`,
  );
  lines.push(
    "rejected は任意です。書く場合は、非選択候補の主な負け筋だけを短く入れてください。",
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
  detailLevel: DetailLevel;
}): Promise<CandidateAiJudgeResult> {
  const system = buildAiSelectionJudgeSystem();
  const userMessage = buildAiSelectionJudgeUser({
    normalized: args.normalized,
    candidates: args.candidates,
    detailLevel: args.detailLevel,
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
    detailLevel: args.detailLevel,
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
          tone: result.ctx.input.articleType,
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
  const articleType = resolveArticleTypeFromNormalized(normalized);
  const detailLevel = resolveDetailLevel(normalized);
  const noticeReason = normalizeJaText(normalized.meta?.noticeReason);
  const ctaMode = resolveCtaMode(normalized);
  const atomicFacts = buildAtomicFacts(normalized);
  const centerDetailPlan = resolveCandidateDetailPlan(detailLevel, 1);
  const previewUsableFacts = buildUsableFactsForRenderer(
    atomicFacts,
    centerDetailPlan,
  );

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
    enabled: true,
    context: productContext ?? null,
    error: null,
  });

  const productFactsBlock = buildProductFactsBlock({
    productId: productId ?? null,
    enabled: true,
    context: productContext ?? null,
    error: null,
  });

  const proseSystem = buildProseSystem({
    articleType,
    isSNS,
    detailLevel,
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
      articleType,
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
      productFactsBlock,
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
    articleType,
    articleTypeLabel: getArticleTypeLabel(articleType),
    detailLevel,
    lengthHint: normalized.length_hint ?? null,
    templateKey,
    isSNS,
    ctaMode,
    proseSystemHash8: ctx.prompts.debug?.proseSystemHash8 ?? null,
    atomicFactCount: atomicFacts.length,
    usableFactIds: previewUsableFacts.map((fact) => fact.id),
    detailBudget: resolveDetailBudget(detailLevel),
    detailCandidatePlans: [0, 1, 2].map((candidateIndex) => {
      const detailPlan = resolveCandidateDetailPlan(detailLevel, candidateIndex);
      return {
        candidateIndex,
        plan: detailPlan.name,
        budget: detailPlan.budget,
      };
    }),
    productFactsStatus: productFactsBlock.meta.status,
    productFactsSceneCount: productFactsBlock.scene.length,
    productFactsValueCount: productFactsBlock.value.length,
    productFactsEvidenceCount: productFactsBlock.evidence.length,
    productFactsGuardCount: productFactsBlock.guard.length,
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
    atomicFacts,
    productFactsBlock,
    passKind: "initial",
    templateKey,
    noticeReason,
    detailLevel,
    articleType,
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

  let aiJudgeUsed = false;
  let aiJudgeReason = "";
  let aiJudgeRawHash8: string | null = null;
  let aiSelectedIndex: number | null = null;
  let aiJudgeDecision: CandidateAiJudgeDecision | null = null;
  let aiRejectedCandidates: CandidateAiJudgeRejected[] = [];
  let aiJudgeSelectedCandidate: CandidateRecord | null = null;

  const inBandCandidateCount = passedCandidates.filter(
    (candidate) => candidate.detailProfile.isInRequestedBand,
  ).length;
  const aiJudgePoolResult = buildAiJudgeCandidatePool({
    candidates: passedCandidates,
    detailLevel,
  });
  const aiJudgeCandidates = aiJudgePoolResult.pool;
  const aiJudgeInBandOnlyApplied = aiJudgePoolResult.inBandOnlyApplied;

  if (aiJudgeCandidates.length >= 2) {
    aiJudgeUsed = true;

    const aiJudgeResult = await judgePassedCandidatesWithAi({
      apiKey,
      model,
      provider,
      requestId,
      normalized,
      candidates: aiJudgeCandidates,
      detailLevel,
    });

    aiJudgeReason = aiJudgeResult.reason;
    aiSelectedIndex = aiJudgeResult.selectedCandidateIndex;
    aiJudgeDecision = aiJudgeResult.decision;
    aiRejectedCandidates = aiJudgeResult.rejected;
    aiJudgeRawHash8 = aiJudgeResult.raw
      ? sha256Hex(aiJudgeResult.raw).slice(0, 8)
      : null;

    if (aiJudgeResult.ok) {
      aiJudgeSelectedCandidate =
        aiJudgeCandidates.find(
          (candidate) =>
            candidate.candidateIndex === aiJudgeResult.selectedCandidateIndex,
        ) ?? null;
    }
  }

  const fallbackHints = buildFallbackSelectionHints({
    aiJudgeAttempted: aiJudgeUsed,
    aiSelectedIndex: aiSelectedIndex,
    aiRejectedCandidates: aiRejectedCandidates,
  });

  const fallbackCandidate =
    selectFallbackCandidate(
      passedCandidates,
      detailLevel,
      fallbackHints,
    ) ?? passedCandidates[0];
  const bestCandidate: CandidateRecord =
    aiJudgeSelectedCandidate ?? fallbackCandidate;
  const selectionSource: "single_pass" | "ai_judge" | "ai_judge_fallback" =
    aiJudgeSelectedCandidate
      ? "ai_judge"
      : aiJudgeUsed
        ? "ai_judge_fallback"
        : "single_pass";

  const topAlternativeCandidate = selectBestAlternativeCandidate(
    passedCandidates,
    bestCandidate.candidateIndex,
    detailLevel,
    fallbackHints,
  );
  const bandEscapeReason = bestCandidate.detailProfile.isInRequestedBand
    ? null
    : selectionSource === "ai_judge"
      ? "ai_judge_out_of_band"
      : selectionSource === "ai_judge_fallback"
        ? "ai_judge_fallback_out_of_band"
        : "single_pass_out_of_band";

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
    requestedDetailLevel: detailLevel,
    inBandCandidateCount,
    aiJudgeCandidateCount: aiJudgeCandidates.length,
    aiJudgeInBandOnlyApplied,
    selectedPassKind: bestCandidate.passKind,
    selectedCandidateIndex: bestCandidate.candidateIndex,
    selectedCandidateDiversityHint: bestCandidate.diversityHint,
    selectedCandidateDetailPlan: bestCandidate.detailPlan.name,
    selectedIsInRequestedBand: bestCandidate.detailProfile.isInRequestedBand,
    bandEscapeReason,
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
    topAlternativeDetailPlan: topAlternativeCandidate?.detailPlan.name ?? null,
    topAlternativeIsInRequestedBand:
      topAlternativeCandidate?.detailProfile.isInRequestedBand ?? null,
    topAlternativeRicherScore: topAlternativeCandidate?.richerBoundary.score ?? null,
    topAlternativeRicherReasons: topAlternativeCandidate?.richerBoundary.reasons ?? [],
    topAlternativeRicherWarnings:
      topAlternativeCandidate?.richerBoundary.warnings ?? [],
    topAlternativeMinimalWarnings:
      topAlternativeCandidate?.minimalBoundary.warnings ?? [],
    selectedDetailBand: bestCandidate.detailProfile.band,
    selectedDetailAlignmentScore: bestCandidate.detailProfile.alignmentScore,
    selectedTotalChars: bestCandidate.detailProfile.totalChars,
    selectedAverageBulletChars: bestCandidate.detailProfile.averageBulletChars,
    topAlternativeDetailBand: topAlternativeCandidate?.detailProfile.band ?? null,
    topAlternativeDetailAlignmentScore:
      topAlternativeCandidate?.detailProfile.alignmentScore ?? null,
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
    hasProductFacts: hasUsableProductFactsBlock(productFactsBlock),
  });

  const proseLog = {
    phase: "pipeline_prose" as const,
    level: "DEBUG",
    route: "/api/writer",
    message: "pipeline generated prose from ai-first renderer",
    provider,
    model,
    requestId,
    requestedDetailLevel: detailLevel,
    selectedCandidateDetailPlan: bestCandidate.detailPlan.name,
    selectedIsInRequestedBand: bestCandidate.detailProfile.isInRequestedBand,
    minimalScore: bestCandidate.minimalBoundary.score,
    minimalReasons: bestCandidate.minimalBoundary.reasons,
    minimalWarnings: bestCandidate.minimalBoundary.warnings,
    richerScore: bestCandidate.richerBoundary.score,
    richerReasons: bestCandidate.richerBoundary.reasons,
    richerWarnings: bestCandidate.richerBoundary.warnings,
    detailBand: bestCandidate.detailProfile.band,
    detailAlignmentScore: bestCandidate.detailProfile.alignmentScore,
    totalChars: bestCandidate.detailProfile.totalChars,
    averageBulletChars: bestCandidate.detailProfile.averageBulletChars,
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
