// app/api/writer/pipeline.ts
import { NextResponse } from "next/server";
import {
  sha256Hex,
  logEvent,
  forceConsoleEvent,
  emitWriterEvent,
} from "./_shared/logger";
import { buildOpenAIRequestPayload, callOpenAI } from "./openai-client";
import { writerLog } from "@/lib/metrics/writerLogger";
import {
  resolveTonePresetKey,
  buildSystemPrompt,
} from "./tone-utils";
import { makeUserMessage } from "./user-message";
import { postProcess, extractMeta, analyzeText } from "./postprocess";
import { buildPromptLayer } from "./prompt/core";

/* =========================
   🧪 Precision Mode Flag（Phase1）
   - Phase1 では常に false（挙動は現行維持）
   - 後続フェーズで compose-v2 / composedSystem / composedUser を採用するスイッチに昇格予定
========================= */

const PRECISION_MODE = false;

/* =========================
   Normalized Input 型（route.ts と同形）
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
   Writer Error Helper（OpenAI系専用の一部）
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

export type WriterErrorLogPayload = {
  reason: string;
  message?: string;
  code?: string;

  requestId?: string;
  provider?: string;
  model?: string;
  phase?: string;
  durationMs?: number;

  api?: {
    status: number;
    statusText: string;
    ms?: number;
  };

  meta?: Record<string, unknown>;
  rawError?: unknown;
};

export type WriterErrorResponseBody =
  | {
      ok: false;
      error: {
        reason: WriterErrorReason;
        message: string;
        code?: string;
        issues?: unknown;
      };
      meta?: {
        requestId?: string;
        [key: string]: unknown;
      };
    }
  | {
      ok: false;
      error: string;
      [key: string]: unknown;
    };

export type WriterErrorOptions = {
  reason: WriterErrorReason;
  status: number;
  message: string;
  code?: string;
  issues?: unknown;
  requestId?: string;
  provider?: string | null;
  model?: string | null;
  durationMs?: number;
  logPayload?: Partial<WriterErrorLogPayload>;
  legacyBody?: { ok: false; error: string; [key: string]: unknown };
};

export async function sendWriterError(
  options: WriterErrorOptions,
): Promise<Response> {
  let body: WriterErrorResponseBody;

  if (options.legacyBody) {
    body = options.legacyBody;
  } else {
    body = {
      ok: false,
      error: {
        reason: options.reason,
        message: options.message,
        ...(options.code ? { code: options.code } : {}),
        ...(typeof options.issues !== "undefined"
          ? { issues: options.issues }
          : {}),
      },
      meta: options.requestId
        ? { requestId: options.requestId }
        : undefined,
    };
  }

  if (options.logPayload) {
    const lp = options.logPayload;

    const payload: any = {
      ok: false,
      reason:
        typeof lp.reason !== "undefined" ? lp.reason : options.reason,
      provider:
        typeof lp.provider !== "undefined"
          ? lp.provider
          : options.provider ?? undefined,
      model:
        typeof lp.model !== "undefined"
          ? lp.model
          : options.model ?? undefined,
      meta:
        typeof lp.meta !== "undefined"
          ? lp.meta
          : null,
    };

    if (typeof lp.api !== "undefined") {
      payload.api = lp.api;
    }
    if (typeof lp.message !== "undefined") {
      payload.message = lp.message;
    }
    if (typeof lp.rawError !== "undefined") {
      payload.rawError = lp.rawError;
    }

    logEvent("error", payload);
    forceConsoleEvent("error", payload);
    await emitWriterEvent("error", payload);

    await writerLog({
      phase: "failure",
      model: options.model ?? undefined,
      durationMs: options.durationMs,
      requestId: options.requestId,
    });
  }

  return NextResponse.json(body, { status: options.status });
}

export async function handleOpenAIApiError(params: {
  message: string;
  details: string;
  status: number;
  statusText: string;
  apiMs: number;
  requestId: string;
  provider: string | undefined;
  model: string | undefined;
  durationMs: number;
}): Promise<Response> {
  const {
    message,
    details,
    status,
    statusText,
    apiMs,
    requestId,
    provider,
    model,
    durationMs,
  } = params;

  return sendWriterError({
    reason: "openai_api_error",
    status: 502,
    message,
    requestId,
    provider,
    model,
    durationMs,
    legacyBody: {
      ok: false,
      error: message,
      details,
    },
    logPayload: {
      reason: "openai_api_error",
      provider,
      model,
      api: {
        status,
        statusText,
        ms: apiMs,
      },
    },
  });
}

export async function handleEmptyContentError(params: {
  status: number;
  statusText: string;
  apiMs: number;
  requestId: string;
  provider: string | undefined;
  model: string | undefined;
  durationMs: number;
}): Promise<Response> {
  const { status, statusText, apiMs, requestId, provider, model, durationMs } =
    params;

  return sendWriterError({
    reason: "openai_empty_content",
    status: 502,
    message: "empty content",
    requestId,
    provider,
    model,
    durationMs,
    legacyBody: {
      ok: false,
      error: "empty content",
    },
    logPayload: {
      reason: "openai_empty_content",
      provider,
      model,
      api: {
        status,
        statusText,
        ms: apiMs,
      },
    },
  });
}

/* =========================
   C7-3 正常フロー補助
   - postProcess〜meta/metrics〜writerLog を関数化
========================= */

export type WriterSuccessArgs = {
  content: string;
  normalized: NormalizedInput;
  toneKey: string;
  provider?: string;
  model?: string;
  temperature: number;
  apiMs: number;
  t0: number;
  requestId: string;
  elapsedMs: number;
};

export async function finalizeWriterSuccess(
  args: WriterSuccessArgs,
): Promise<Response> {
  const {
    content,
    normalized,
    toneKey,
    provider,
    model,
    temperature,
    apiMs,
    t0,
    requestId,
    elapsedMs,
  } = args;

  const text = postProcess(content, normalized);
  const meta = extractMeta(text, toneKey);
  const metrics = analyzeText(text);

  const totalMs = Date.now() - t0;

  const payloadOk = {
    ok: true,
    provider,
    model,
    temperature,
    input: {
      category: normalized.category,
      goal: normalized.goal,
      platform: normalized.platform ?? null,
    },
    meta,
    metrics,
    durations: { apiMs, totalMs },
    hash: { text_sha256_16: sha256Hex(text).slice(0, 16) },
  };

  logEvent("ok", payloadOk);
  forceConsoleEvent("ok", payloadOk);
  await emitWriterEvent("ok", payloadOk);

  const payload = {
    ok: true,
    data: { text, meta },
    output: text,
  };

  await writerLog({
    phase: "success",
    model,
    durationMs: elapsedMs,
    requestId,
  });

  return NextResponse.json(payload, { status: 200 });
}

/* =========================
   Phase1-P1-5 Precision Prompt 観測ログ
   - compose-v2 の人格化 system/user を比較観測
   - 本番レスポンス shape には影響なし
   - A案（A-1）：userPreview をログに残さず、
     長さ・有無・匿名ハッシュのみ保持
========================= */

type PrecisionPromptObservationArgs = {
  mode: "on" | "off";
  variant: string;
  route: string;
  provider?: string;
  model?: string;
  requestId: string;
  toneKey: string;
  currentSystem: string;
  currentUser: string;
  precisionSystem?: string | null;
  precisionUser?: string | null;
};

function previewPromptSegment(
  value: string | null | undefined,
  maxLength = 160,
): string {
  if (!value) return "";
  return value.length <= maxLength ? value : value.slice(0, maxLength);
}

async function logPrecisionPromptObservation(
  args: PrecisionPromptObservationArgs,
): Promise<void> {
  const {
    mode,
    variant,
    route,
    provider,
    model,
    requestId,
    toneKey,
    currentSystem,
    currentUser,
    precisionSystem,
    precisionUser,
  } = args;

  const currentHasUser = currentUser.trim().length > 0;
  const precisionHasUser =
    typeof precisionUser === "string" && precisionUser.trim().length > 0;

  const currentUserHash8 = currentHasUser
    ? sha256Hex(currentUser).slice(0, 8)
    : null;

  const precisionUserHash8 =
    precisionHasUser && typeof precisionUser === "string"
      ? sha256Hex(precisionUser).slice(0, 8)
      : null;

  const payload = {
    phase: "precision_prompt" as const,
    level: "DEBUG",
    route,
    message: "precision prompt observation",
    provider,
    model,
    requestId,
    toneKey,
    precisionMode: mode,
    variant,
    role: "system_user_pair" as const,
    current: {
      systemPreview: previewPromptSegment(currentSystem),
      systemLength: currentSystem.length,
      userLength: currentUser.length,
      hasUser: currentHasUser,
      userHash8: currentUserHash8,
    },
    precision: {
      systemPreview: previewPromptSegment(precisionSystem),
      systemLength: precisionSystem ? precisionSystem.length : 0,
      userLength: precisionUser ? precisionUser.length : 0,
      hasSystem:
        typeof precisionSystem === "string" &&
        precisionSystem.trim().length > 0,
      hasUser: precisionHasUser,
      userHash8: precisionUserHash8,
    },
  };

  // Phase1 では WriterLogKind に "debug" がないため、
  // ひとまず "ok" チャンネルに流して観測する。
  // phase="precision_prompt" で通常の ok と識別可能。
  logEvent("ok", payload);
  forceConsoleEvent("ok", payload);
  await emitWriterEvent("ok", payload);
}

/* =========================
   🆕 C7-4 Normal Flow Pipeline（A案）
   - 正常系の「本体」（tone 解決〜OpenAI呼び出し〜成功/エラー処理）
   - Phase1 Precision：
     PRECISION_MODE=true のときのみ composedSystem/composedUser を採用
========================= */

export type WriterPipelineArgs = {
  rawPrompt: string;
  normalized: NormalizedInput;
  provider: string | undefined;
  model: string | undefined;
  temperature: number;
  systemOverride: string;
  composedSystem?: string | null;
  composedUser?: string | null;
  apiKey: string;
  t0: number;
  requestId: string;
  elapsed: () => number;
};

export async function runWriterPipeline(
  args: WriterPipelineArgs,
): Promise<Response> {
  const {
    rawPrompt,
    normalized,
    provider,
    model,
    temperature,
    systemOverride,
    composedSystem,
    composedUser,
    apiKey,
    t0,
    requestId,
    elapsed,
  } = args;

  const toneKey = resolveTonePresetKey(normalized.tone, normalized.style);

  // 🔍 Precision Prompt Layer（安全モード接続）
  // - 常に buildPromptLayer は実行（ログ・解析用途）
  // - 実際に OpenAI に投げる system/user は PRECISION_MODE で切り替え
  await buildPromptLayer({
    normalized,
    systemOverride,
    composedSystem,
    composedUser,
    toneKey,
  });

  const baseSystem = buildSystemPrompt({ overrides: systemOverride, toneKey });
  const baseUserMessage = makeUserMessage(normalized);

  const shouldUseComposedSystem =
    PRECISION_MODE &&
    typeof composedSystem === "string" &&
    composedSystem.trim().length > 0;

  const shouldUseComposedUser =
    PRECISION_MODE &&
    typeof composedUser === "string" &&
    composedUser.trim().length > 0;

  const system = shouldUseComposedSystem ? composedSystem! : baseSystem;
  const userMessage = shouldUseComposedUser ? composedUser! : baseUserMessage;

  await logPrecisionPromptObservation({
    mode: PRECISION_MODE ? "on" : "off",
    variant: "compose-v2",
    route: "/api/writer",
    provider,
    model,
    requestId,
    toneKey,
    currentSystem: baseSystem,
    currentUser: baseUserMessage,
    precisionSystem: composedSystem ?? null,
    precisionUser: composedUser ?? null,
  });

  const openaiPayload = buildOpenAIRequestPayload({
    model,
    temperature,
    system,
    userMessage,
  });

  const openaiResult = await callOpenAI({
    apiKey,
    payload: openaiPayload,
  });

  if (!openaiResult.ok) {
    const message = `openai api error: ${openaiResult.status} ${openaiResult.statusText}`;

    return handleOpenAIApiError({
      message,
      details: openaiResult.errorText?.slice(0, 2000) ?? "",
      status: openaiResult.status,
      statusText: openaiResult.statusText,
      apiMs: openaiResult.apiMs,
      requestId,
      provider,
      model,
      durationMs: elapsed(),
    });
  }

  const { content, apiMs, status, statusText } = openaiResult;

  if (!content) {
    return handleEmptyContentError({
      status,
      statusText,
      apiMs,
      requestId,
      provider,
      model,
      durationMs: elapsed(),
    });
  }

  return finalizeWriterSuccess({
    content,
    normalized,
    toneKey,
    provider,
    model,
    temperature,
    apiMs,
    t0,
    requestId,
    elapsedMs: elapsed(),
  });
}
