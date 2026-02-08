// app/api/writer/pipeline.ts
import { NextResponse } from "next/server";
import { sha256Hex, logEvent, forceConsoleEvent, emitWriterEvent } from "./_shared/logger";
import { buildOpenAIRequestPayload, callOpenAI } from "./openai-client";
import { resolveTonePresetKey, buildSystemPrompt } from "./tone-utils";
import { makeUserMessage } from "./user-message";
import type { ProductContext } from "@/server/products/repository";
import { logProductContextStatus } from "./logger";
import { buildPrecisionProductPayload, buildProductFactsDto } from "@/server/products/dto";
import { buildProductFactsBlock } from "./prompt/product-facts";
import { applyPostprocess } from "./postprocess";

/**
 * 目的（新設計）:
 * - Pipeline は 3工程（Normalize / Decide / Handoff）に縮退
 * - ✅ 生成品質を安定させるため「内部3案生成→L3スコア→最良案採用」を Handoff 内で行う
 * - CTAのSSOT: ctx.flags.cta.mode ("on" | "off")
 * - CTAブロック仕様SSOT: ctx.contracts.ctaBlock（仕様のみ。生成は他責務）
 * - ✅ 実運用上必要なので applyPostprocess() は “返却直前” にのみ適用する（data.text / output を同一に固定）
 * - ✅ さらに “最終返却の直前” に repair を必ず通し、UI/モデル差に依存しない改行を担保する
 */

/* =========================
   Normalized Input（route.ts と同形）
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
};

/* =========================
   Writer Errors
========================= */

export type WriterErrorReason =
  | "validation"
  | "content_policy"
  | "openai"
  | "openai_api_error"
  | "openai_empty_content"
  | "timeout"
  | "rate_limit"
  | "bad_request"
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

/* =========================
   SSOT（CTA / Contracts）
========================= */

export type CtaMode = "on" | "off";

export type CtaBlockContract = {
  heading: "おすすめのアクション";
  variants: readonly ["おすすめのアクション", "おすすめアクション", "おすすめの行動"];
  placement: {
    atEnd: true;
    withinLastLines: 30;
  };
  bulletRules: {
    minBulletLines: 2;
  };
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
  prompts: {
    system: string;
    user: string;
    debug?: {
      baseSystemLength: number;
      userLength: number;
      systemHash8: string;
      userHash8: string;
      hasProductFacts: boolean;
    };
  };
  product: {
    precisionPayload: ReturnType<typeof buildPrecisionProductPayload>;
    productFacts: ReturnType<typeof buildProductFactsDto>;
    productFactsBlock: string | null;
  };
};

/* =========================
   Normalize
========================= */

function resolveTemplateKey(n: NormalizedInput): string {
  const metaTemplate = (n as any)?.meta?.template;
  const platform = (n as any)?.platform;
  const raw = (metaTemplate ?? platform ?? "").toString().trim().toLowerCase();
  return raw;
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
  const candidates = [(n as any)?.meta?.cta, (n as any)?.metaCta, (n as any)?.ctaEnabled, (n as any)?.cta];
  for (const c of candidates) {
    const b = parseBooleanLike(c);
    if (b !== null) return b ? "on" : "off";
  }
  return "on";
}

/* =========================
   Decide（L3を生成に強制）
========================= */

function buildOutputRulesSuffix(normalized: NormalizedInput): string {
  const templateKey = resolveTemplateKey(normalized);
  const isSNS = isSnsLikeTemplate(templateKey);
  const pn = (normalized.product_name ?? "").toString().trim();

  const rules = [
    "",
    "---",
    "出力ルール（厳守）:",
    "- 見出し（## 等）を出さない。",
    "- ヘッド2文（用途+主ベネフィット / 使用シーン）→ 箇条書き最大3点（コア機能→困りごと解消→汎用価値）の順に出力する。",
    "- 抽象まとめ・同義反復で水増ししない。",
    "- 短文化は努力目標ではなく制約（余計な説明を足さない）。",
    "- 固有情報は入力にあるもののみ（推測/捏造禁止）。",
    "",
    "ヘッドの制約:",
    `- 1文目は product_name を必ず含める${pn ? `（"${pn}"を省略しない）` : ""}。`,
    "- 1文目は「用途+主ベネフィット」を事実ベースで短く書く（説明禁止）。",
    "- 2文目は「使用シーン」のみを書く（説明禁止）。",
    "- ヘッドで「重要」「サポート」「〜でしょう」などの水増し語を入れない。",
    "",
    "ボディ（箇条書き）:",
    "- 箇条書きは最大3点。必ず改行し、1行1点にする（1行に複数要素を詰めない）。",
    "- 順序固定：①コア機能 → ②困りごと解消 → ③汎用価値。",
    "",
    "補助:",
    "- objections/cta_preference が入力にある場合のみ末尾に短く補助（無ければ出さない）。",
  ].join("\n");

  if (isSNS) return `${rules}\n- SNS投稿として不自然に長くしない。`;
  return rules;
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
   Internal Scoring（L3違反スコア）
========================= */

type L3ScoreDetail = {
  score: number;
  reasons: string[];
  facts: {
    headSentences: number;
    hasHeading: boolean;
    bulletLines: number;
    hasProductNameInHead1: boolean;
    headHasBannedWord: boolean;
    hasCanDoPhrase: boolean;
    bulletLooksCollapsed: boolean;
  };
};

function splitHeadAndBody(text: string): { head: string; body: string } {
  const t = (text ?? "").toString().replace(/\r\n/g, "\n").trim();
  if (!t) return { head: "", body: "" };
  const idxBullet = t.search(/(^|\n)\s*[・\-]/m);
  if (idxBullet >= 0) return { head: t.slice(0, idxBullet).trim(), body: t.slice(idxBullet).trim() };
  return { head: t, body: "" };
}

function countHeadSentences(head: string): number {
  const h = (head ?? "").toString().trim();
  if (!h) return 0;
  const byMaru = h.split("。").map((s) => s.trim()).filter(Boolean);
  if (byMaru.length >= 1) return byMaru.length;
  const byLine = h.split("\n").map((s) => s.trim()).filter(Boolean);
  return byLine.length;
}

function extractHead1(head: string): string {
  const h = (head ?? "").toString().trim();
  if (!h) return "";
  const i = h.indexOf("。");
  if (i >= 0) return h.slice(0, i + 1);
  const line = h.split("\n").map((s) => s.trim()).filter(Boolean)[0] ?? "";
  return line;
}

function collectBulletLines(body: string): string[] {
  const b = (body ?? "").toString().replace(/\r\n/g, "\n").trim();
  if (!b) return [];
  return b
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((ln) => /^[・\-]\s*/.test(ln));
}

/**
 * ✅ repair（最小・安全）
 * - 1行詰め込み（・A・B・C / ・ A・ B・ C）→ 1行1点に分解
 * - その後、必ず「最大3点」に丸める（②型を安定して勝たせるため）
 * - 返すのは“本文だけ”のまま（付与はしない）
 *
 * 重要:
 * - 「保温・保冷」のような “語彙中点” は極力分割しない
 * - 分割対象は「箇条書きの詰め込み」と判断できる区切り中点のみ
 */
function repairBulletsToMax3(text: string): { text: string; didRepair: boolean } {
  const raw = (text ?? "").toString().replace(/\r\n/g, "\n").trim();
  if (!raw) return { text: raw, didRepair: false };

  const { head, body } = splitHeadAndBody(raw);
  if (!body) return { text: raw, didRepair: false };

  const lines = body.split("\n").map((s) => s.trim()).filter(Boolean);

  let didRepair = false;
  const repairedBullets: string[] = [];
  const tailLines: string[] = [];

  const looksLikeSeparatorStart = (s: string): boolean => {
    const t = (s ?? "").toString().trim();
    if (!t) return false;

    // よくある “項目の開始” を雑に検出（repair専用のヒューリスティック）
    // 例: "スマートフォンを..." / "配線が..." / "シンプルな..." / "LEDライトと..."
    if (/^[0-9A-Za-z]/.test(t)) return true;
    if (/^[「『（(【]/.test(t)) return true;

    // 名詞句 + 助詞/連体「な」っぽい開始
    if (/^(?:.{1,12}?)(?:を|が|に|で|と|の|や|へ|も|な)/.test(t)) return true;

    // 「しにくく」「でき」など動詞系の開始も拾う（最低限）
    if (/^(?:し|でき|なる|保て|守れ|使え)/.test(t)) return true;

    return false;
  };

  const splitCollapsedBullet = (stripped: string): string[] => {
    const s = (stripped ?? "").toString().trim();
    if (!s) return [];

    // "・" が1つ以下なら分割しない（語彙中点の可能性が高い）
    const dotCount = (s.match(/・/g) ?? []).length;
    if (dotCount <= 1) return [s];

    // 走査して、区切りに見える "・" だけで分割する
    const parts: string[] = [];
    let buf = "";

    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch !== "・") {
        buf += ch;
        continue;
      }

      // 次の文字列（右側）を見て、項目開始っぽければ区切りとして扱う
      const right = s.slice(i + 1);
      const rightTrimmed = right.replace(/^[ \t\u3000]+/, "");
      const isSeparator = looksLikeSeparatorStart(rightTrimmed);

      if (isSeparator) {
        const left = buf.trim();
        if (left) parts.push(left);
        buf = "";
        // "・" 自体は捨てて、右側の空白も次ループで拾わせない
        // ただし、ここで i は進めず、次ループで rightの先頭を処理
        continue;
      }

      // 語彙中点っぽいので保持
      buf += ch;
    }

    const last = buf.trim();
    if (last) parts.push(last);

    // 分割できていない場合は元のまま
    if (parts.length <= 1) return [s];

    return parts;
  };

  for (const ln of lines) {
    const isBullet = /^[・\-]\s*/.test(ln);
    if (!isBullet) {
      tailLines.push(ln);
      continue;
    }

    // 先頭記号を揃える（・優先）
    const bulletMark = ln.startsWith("-") ? "-" : "・";

    // 先頭の箇条書き記号だけ剥がす
    let stripped = ln.replace(/^[・\-]\s*/, "").trim();

    // 詰め込みを分解（空白なし中点も対象）
    const parts = splitCollapsedBullet(stripped);

    if (parts.length >= 2) {
      didRepair = true;
      for (const p of parts) repairedBullets.push(`${bulletMark} ${p}`.trim());
      continue;
    }

    repairedBullets.push(`${bulletMark} ${stripped}`.trim());
  }

  // ✅ 最大3点に丸める
  if (repairedBullets.length > 3) {
    didRepair = true;
    repairedBullets.splice(3);
  }

  const rebuiltBody = [...repairedBullets, ...tailLines].join("\n").trim();
  const rebuilt = rebuiltBody ? `${head}\n\n${rebuiltBody}`.trim() : head.trim();

  return { text: rebuilt, didRepair };
}

function scoreByL3Rules(text: string, normalized: NormalizedInput): L3ScoreDetail {
  const reasons: string[] = [];
  let score = 0;

  const t = (text ?? "").toString();
  const { head, body } = splitHeadAndBody(t);

  const hasHeading = /(^|\n)\s*##\s+/m.test(t);
  if (hasHeading) {
    score += 8;
    reasons.push("HAS_HEADING");
  }

  const headSentences = countHeadSentences(head);
  if (headSentences !== 2) {
    score += 8;
    reasons.push(`HEAD_SENTENCES_${headSentences}`);
  }

  const head1 = extractHead1(head);
  const pn = (normalized.product_name ?? "").toString().trim();
  const hasProductNameInHead1 = pn ? head1.includes(pn) : true;
  if (!hasProductNameInHead1) {
    score += 12;
    reasons.push("MISSING_PRODUCT_NAME_IN_HEAD1");
  }

  const bannedHeadWords = [
    "最適",
    "ぴったり",
    "おすすめ",
    "大活躍",
    "便利",
    "快適",
    "楽しめます",
    "楽しむ",
    "嬉しい",
    "安心",
    "重要",
    "サポート",
    "でしょう",
    "思います",
    "適しています",
  ];
  const headHasBannedWord = bannedHeadWords.some((w) => w && head.includes(w));
  if (headHasBannedWord) {
    score += 1;
    reasons.push("HEAD_HAS_BANNED_WORD");
  }

  const hasCanDoPhrase = /できます|することができます/.test(head);
  if (hasCanDoPhrase) {
    score += 1;
    reasons.push("HEAD_HAS_CAN_DO_PHRASE");
  }

  const bullets = collectBulletLines(body);
  const bulletLines = bullets.length;

  if (bulletLines === 0) {
    score += 10;
    reasons.push("NO_BULLETS");
  } else if (bulletLines < 3) {
    score += 6 + (3 - bulletLines);
    reasons.push(`TOO_FEW_BULLETS_${bulletLines}`);
  } else if (bulletLines > 3) {
    score += 4 + (bulletLines - 3);
    reasons.push(`TOO_MANY_BULLETS_${bulletLines}`);
  }

  let bulletLooksCollapsed = false;
  for (const ln of bullets) {
    const countDot = (ln.match(/・/g) ?? []).length;
    if (countDot >= 2) {
      bulletLooksCollapsed = true;
      break;
    }
  }
  if (bulletLooksCollapsed) {
    score += 3;
    reasons.push("BULLETS_COLLAPSED_INTO_ONE_LINE");
  }

  const hasFaqLike = /FAQ|よくある質問|Q[:：]/.test(t);
  const hasObjections = Array.isArray((normalized as any).objections) && (normalized as any).objections.length > 0;
  const hasCtaPref = Array.isArray((normalized as any).cta_preference) && (normalized as any).cta_preference.length > 0;
  if (hasFaqLike && !(hasObjections || hasCtaPref)) {
    score += 2;
    reasons.push("UNNEEDED_FAQ_LIKE");
  }

  return {
    score,
    reasons,
    facts: {
      headSentences,
      hasHeading,
      bulletLines,
      hasProductNameInHead1,
      headHasBannedWord,
      hasCanDoPhrase,
      bulletLooksCollapsed,
    },
  };
}

function chooseBestCandidate(
  candidates: Array<{ idx: number; content: string; apiMs: number; status: number; statusText: string }>,
  normalized: NormalizedInput,
) {
  const repaired = candidates.map((c) => {
    const r = repairBulletsToMax3(c.content);
    return { ...c, content: r.text, didRepair: r.didRepair };
  });

  const scored = repaired.map((c) => {
    const detail = scoreByL3Rules(c.content, normalized);
    return { ...c, score: detail.score, reasons: detail.reasons, facts: detail.facts };
  });

  const preferencePenalty = (facts: L3ScoreDetail["facts"]) => {
    let p = 0;
    if (facts.headSentences !== 2) p += 5;
    if (!facts.hasProductNameInHead1) p += 6;
    if (facts.hasHeading) p += 3;
    if (facts.bulletLines !== 3) p += 4;
    if (facts.bulletLooksCollapsed) p += 2;
    return p;
  };

  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;

    const pa = preferencePenalty(a.facts);
    const pb = preferencePenalty(b.facts);
    if (pa !== pb) return pa - pb;

    return a.content.length - b.content.length;
  });

  return { best: scored[0], scored };
}

/* =========================
   Handoff
========================= */

export type WriterPipelineArgs = {
  rawPrompt: string;
  normalized: NormalizedInput;
  provider: string | undefined;
  model: string | undefined;
  temperature: number;
  systemOverride: string;
  apiKey: string;
  t0: number;
  requestId: string;
  elapsed: () => number;
  productId?: string | null;
  productContext?: ProductContext | null;
};

export async function runWriterPipeline(args: WriterPipelineArgs): Promise<Response> {
  const result = await runWriterPipelineCore(args);

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          reason: result.reason,
          message: result.message,
          ...(result.code ? { code: result.code } : {}),
        },
        meta: result.meta ?? undefined,
      },
      { status: 502 },
    );
  }

  let finalText = applyPostprocess(result.openai.content, result.ctx.input.normalized as any);

  {
    const repaired = repairBulletsToMax3(finalText);
    finalText = repaired.text;
  }

  return NextResponse.json(
    {
      ok: true,
      data: {
        text: finalText,
        meta: {
          style: (result.ctx.input.normalized.style ?? "").toString(),
          tone: (result.ctx.input.normalized.tone ?? "").toString(),
          locale: "ja-JP",
          toneKey: result.ctx.input.toneKey,
          template: result.ctx.input.templateKey || null,
          ctaMode: result.ctx.flags.cta.mode,
        },
      },
      output: finalText,
    },
    { status: 200 },
  );
}

export async function runWriterPipelineCore(args: WriterPipelineArgs): Promise<WriterPipelineResult> {
  const {
    rawPrompt,
    normalized,
    provider,
    model,
    temperature,
    systemOverride,
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

  const productFactsBlock = buildProductFactsBlock(precisionPayload, productFacts);

  const baseSystemRaw = buildSystemPrompt({
    overrides: systemOverride,
    toneKey,
  });

  const safetyConstraintsBlock = [
    "制約:",
    "- 入力に無い具体値（数値・期間・等級・型番・受賞・ランキング・保証条件など）は断定しない。",
    "- 不足情報は“想像で補わない”。分からない要素は触れない。",
    "- 過剰なFAQ、強引な断定、煽り見出し（今すぐ/必ず/絶対等）は避ける。",
    "- 本文のみを出力する。追加ブロック（CTA/FAQなど）は書かない。",
  ].join("\n");

  const systemParts: string[] = [baseSystemRaw];
  if (productFactsBlock) systemParts.push(productFactsBlock);
  systemParts.push(safetyConstraintsBlock);
  const system = systemParts.join("\n\n");

  const baseUserMessage = makeUserMessage(normalized);
  const user = `${baseUserMessage}\n${buildOutputRulesSuffix(normalized)}`;

  const ctx: WriterPipelineCtx = {
    request: { requestId, route: "/api/writer", provider, model, temperature, t0 },
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
    contracts: { ctaBlock: buildCtaBlockContract() },
    prompts: {
      system,
      user,
      debug: {
        baseSystemLength: system.length,
        userLength: user.length,
        systemHash8: sha256Hex(system).slice(0, 8),
        userHash8: sha256Hex(user).slice(0, 8),
        hasProductFacts: Boolean(productFactsBlock),
      },
    },
    product: {
      precisionPayload,
      productFacts,
      productFactsBlock: productFactsBlock ?? null,
    },
  };

  const decideLog = {
    phase: "pipeline_decide" as const,
    level: "DEBUG",
    route: "/api/writer",
    message: "pipeline decided prompts and flags",
    provider,
    model,
    requestId,
    toneKey,
    templateKey,
    isSNS,
    ctaMode,
    systemHash8: ctx.prompts.debug?.systemHash8 ?? null,
    userHash8: ctx.prompts.debug?.userHash8 ?? null,
    hasProductFacts: ctx.prompts.debug?.hasProductFacts ?? false,
  };
  logEvent("ok", decideLog);
  forceConsoleEvent("ok", decideLog);
  await emitWriterEvent("ok", decideLog);

  const openaiPayload = buildOpenAIRequestPayload({
    model,
    temperature,
    system: ctx.prompts.system,
    userMessage: ctx.prompts.user,
  });

  const callOnce = async (idx: number) => {
    const r = await callOpenAI({ apiKey, payload: openaiPayload });
    if (!r.ok) {
      return {
        ok: false as const,
        idx,
        status: r.status,
        statusText: r.statusText,
        apiMs: r.apiMs,
        errorTextPreview: r.errorText?.slice(0, 500) ?? "",
      };
    }
    return {
      ok: true as const,
      idx,
      content: (r.content ?? "").toString(),
      status: r.status,
      statusText: r.statusText,
      apiMs: r.apiMs,
    };
  };

  const results = await Promise.all([callOnce(1), callOnce(2), callOnce(3)]);

  const oks = results.filter((x): x is Extract<(typeof results)[number], { ok: true }> => x.ok);
  const ngs = results.filter((x): x is Extract<(typeof results)[number], { ok: false }> => !x.ok);

  if (oks.length === 0) {
    const first = ngs[0];
    const message = `openai api error: ${first?.status ?? 0} ${first?.statusText ?? "unknown"}`;
    const errLog = {
      phase: "pipeline_handoff" as const,
      level: "ERROR",
      route: "/api/writer",
      message,
      provider,
      model,
      requestId,
      status: first?.status ?? 0,
      statusText: first?.statusText ?? "unknown",
      apiMs: first?.apiMs ?? 0,
      errorTextPreview: first?.errorTextPreview ?? "",
      attempts: results.map((x) => ({
        idx: x.idx,
        ok: x.ok,
        status: (x as any).status ?? null,
        apiMs: (x as any).apiMs ?? null,
      })),
    };
    logEvent("error", errLog);
    forceConsoleEvent("error", errLog);
    await emitWriterEvent("error", errLog);
    return { ok: false, reason: "openai_api_error", message, meta: { requestId } };
  }

  const { best, scored } = chooseBestCandidate(
    oks.map((x) => ({
      idx: x.idx,
      content: x.content,
      apiMs: x.apiMs,
      status: x.status,
      statusText: x.statusText,
    })),
    normalized,
  );

  const selectLog = {
    phase: "pipeline_select" as const,
    level: "DEBUG",
    route: "/api/writer",
    message: "selected best candidate by L3 scoring",
    provider,
    model,
    requestId,
    selectedIdx: best.idx,
    selectedScore: best.score,
    selectedDidRepair: Boolean((best as any).didRepair),
    selectedReasons: best.reasons.slice(0, 12),
    selectedFacts: best.facts,
    candidateScores: scored.map((s) => ({
      idx: s.idx,
      score: s.score,
      didRepair: Boolean((s as any).didRepair),
      reasons: s.reasons.slice(0, 8),
      facts: s.facts,
      contentLen: s.content.length,
      contentHash8: sha256Hex(s.content).slice(0, 8),
      apiMs: s.apiMs,
      status: s.status,
    })),
    failedAttempts: ngs.map((n) => ({
      idx: n.idx,
      status: n.status,
      statusText: n.statusText,
      apiMs: n.apiMs,
    })),
  };
  logEvent("ok", selectLog);
  forceConsoleEvent("ok", selectLog);
  await emitWriterEvent("ok", selectLog);

  const chosenContent = (best.content ?? "").toString().trim();
  if (!chosenContent) {
    const errLog = {
      phase: "pipeline_handoff" as const,
      level: "ERROR",
      route: "/api/writer",
      message: "empty content",
      provider,
      model,
      requestId,
      status: best.status,
      statusText: best.statusText,
      apiMs: best.apiMs,
    };
    logEvent("error", errLog);
    forceConsoleEvent("error", errLog);
    await emitWriterEvent("error", errLog);
    return { ok: false, reason: "openai_empty_content", message: "empty content", meta: { requestId } };
  }

  return {
    ok: true,
    ctx,
    openai: { content: chosenContent, apiMs: best.apiMs, status: best.status, statusText: best.statusText },
  };
}
