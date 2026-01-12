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
 * - 文字列整形/付与（CTA/FAQ/フッターなど）や metrics / prompt-builder はここではやらない
 * - CTAのSSOT: ctx.flags.cta.mode ("on" | "off")
 * - CTAブロック仕様SSOT: ctx.contracts.ctaBlock（仕様のみ。生成は他責務）
 * - ✅ 実運用上必要なので applyPostprocess() は “返却直前” にのみ適用する（data.text / output を同一に固定）
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
   Writer Errors（pipeline内は「Response化」までやらず、route側に委譲できる形で保持）
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
      mode: CtaMode; // ✅ CTA SSOT
    };
  };
  contracts: {
    ctaBlock: CtaBlockContract; // ✅ CTAブロック仕様 SSOT
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
   Normalize（入力の揺れ吸収：template / CTA）
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

/**
 * CTA ON/OFF 判定（揺れ吸収）
 * - SSOT は ctx.flags.cta.mode へ集約
 * - 何も見つからない場合は従来互換で ON
 */
function resolveCtaMode(n: NormalizedInput): CtaMode {
  const candidates = [(n as any)?.meta?.cta, (n as any)?.metaCta, (n as any)?.ctaEnabled, (n as any)?.cta];

  for (const c of candidates) {
    const b = parseBooleanLike(c);
    if (b !== null) return b ? "on" : "off";
  }
  return "on";
}

/* =========================
   Decide（プロンプト確定：ここでは「生成」も「整形」もしない）
========================= */

function buildOutputRulesSuffix(normalized: NormalizedInput): string {
  const templateKey = resolveTemplateKey(normalized);
  const isSNS = isSnsLikeTemplate(templateKey);

  if (isSNS) {
    return [
      "",
      "---",
      "出力ルール:",
      "- SNS投稿として短く自然に。",
      "- 見出し（##）は使わない。",
      "- CTA/FAQなどの追加ブロックは書かない（後段で付与する可能性がある）。",
      "- 具体的な数値・型番・受賞・ランキング等は、入力に無ければ書かない。",
    ].join("\n");
  }

  return [
    "",
    "---",
    "出力ルール:",
    "- 本文のみ。FAQ/CTAなどの追加ブロックは書かない（後段で付与する可能性がある）。",
    "- 見出しは最大2つまで（必要な場合のみ）。過剰な箇条書き・過剰な煽り見出しは避ける。",
    "- 具体的な数値・型番・ランキング・受賞・保証条件などは、入力に無ければ断定しない。",
    "- 不足情報を“想像で補う”のは禁止。分からない要素は触れない。",
  ].join("\n");
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
   Handoff（OpenAI呼び出し：結果は raw のまま返す）
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

/**
 * ✅ 新pipeline（3工程）
 * - 戻り値は「raw content + ctx」。Response化・整形・計測は他責務へ追放する前提。
 * - 互換のため、現段階では NextResponse.json を返すヘルパも用意（routeが未改修でも動かせる逃げ道）
 */
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

  // ✅ 返却直前にのみ postprocess（data.text / output を同一に固定）
  const finalText = applyPostprocess(result.openai.content, result.ctx.input.normalized as any);

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

/**
 * 本体（Response化しないコア）
 */
export async function runWriterPipelineCore(args: WriterPipelineArgs): Promise<WriterPipelineResult> {
  const { rawPrompt, normalized, provider, model, temperature, systemOverride, apiKey, t0, requestId, productId, productContext } = args;

  // ===== Normalize =====
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

  // ===== Decide =====
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

  // ===== Handoff =====
  const openaiPayload = buildOpenAIRequestPayload({
    model,
    temperature,
    system: ctx.prompts.system,
    userMessage: ctx.prompts.user,
  });

  const openaiResult = await callOpenAI({ apiKey, payload: openaiPayload });

  if (!openaiResult.ok) {
    const message = `openai api error: ${openaiResult.status} ${openaiResult.statusText}`;
    const errLog = {
      phase: "pipeline_handoff" as const,
      level: "ERROR",
      route: "/api/writer",
      message,
      provider,
      model,
      requestId,
      status: openaiResult.status,
      statusText: openaiResult.statusText,
      apiMs: openaiResult.apiMs,
      errorTextPreview: openaiResult.errorText?.slice(0, 500) ?? "",
    };
    logEvent("error", errLog);
    forceConsoleEvent("error", errLog);
    await emitWriterEvent("error", errLog);

    return { ok: false, reason: "openai_api_error", message, meta: { requestId } };
  }

  const { content, apiMs, status, statusText } = openaiResult;

  if (!content) {
    const errLog = {
      phase: "pipeline_handoff" as const,
      level: "ERROR",
      route: "/api/writer",
      message: "empty content",
      provider,
      model,
      requestId,
      status,
      statusText,
      apiMs,
    };
    logEvent("error", errLog);
    forceConsoleEvent("error", errLog);
    await emitWriterEvent("error", errLog);

    return { ok: false, reason: "openai_empty_content", message: "empty content", meta: { requestId } };
  }

  return { ok: true, ctx, openai: { content, apiMs, status, statusText } };
}
