/** app/api/writer/error-layer.ts
 * Phase C9: Error Layer 抽出
 * - /api/writer の共通エラーハンドリングを集約するレイヤー
 * - route.ts 内の既存エラーロジックと挙動を完全に一致させる
 */

import { NextResponse } from "next/server";
import { writerLog } from "@/lib/metrics/writerLogger";
import { logEvent, forceConsoleEvent, emitWriterEvent } from "./_shared/logger";

/* =========================
   Writer Error Helper（共通エラーハンドリング）
========================= */

export type WriterErrorReason =
  | "validation" // 入力バリデーションエラー
  | "content_policy" // コンテンツポリシー違反
  | "openai" // OpenAI 系一般カテゴリ
  | "openai_api_error" // OpenAI API エラー応答
  | "openai_empty_content" // OpenAI 応答の本文欠落
  | "timeout"
  | "rate_limit"
  | "bad_request"
  | "internal";

export type WriterErrorLogPayload = {
  reason: WriterErrorReason | string;
  message?: string;
  code?: string;
  issues?: unknown;
  requestId?: string;
  provider?: string | null;
  model?: string | null;
  durationMs?: number;
  api?: {
    status?: number;
    statusText?: string;
    ms?: number;
  };
  meta?: Record<string, unknown> | null;
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
      meta?: {
        requestId?: string;
        [key: string]: unknown;
      };
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
  legacyBody?: {
    ok: false;
    error: string;
    details?: unknown;
  };
  logPayload?: Partial<WriterErrorLogPayload>;
};

/**
 * /api/writer のエラー応答とログを統一的に扱うヘルパー
 * - legacyBody あり: 既存 shape（{ ok:false, error:string, ... }）をそのまま返す
 * - legacyBody なし: 統一エラー shape で返す
 */
export async function sendWriterError(
  options: WriterErrorOptions,
): Promise<NextResponse<WriterErrorResponseBody>> {
  const {
    reason,
    status,
    message,
    code,
    issues,
    requestId,
    provider,
    model,
    durationMs,
    legacyBody,
    logPayload,
  } = options;

  let body: WriterErrorResponseBody;

  if (legacyBody) {
    // 旧仕様 shape を完全維持
    body = legacyBody;
  } else {
    // 新仕様（統一エラー shape）
    body = {
      ok: false,
      error: {
        reason,
        message,
        ...(code ? { code } : {}),
        ...(typeof issues !== "undefined" ? { issues } : {}),
      },
      ...(requestId ? { meta: { requestId } } : {}),
    };
  }

  // logPayload が指定されている場合のみログを出す
  if (logPayload) {
    const lp = logPayload;

    const payload: any = {
      ok: false,
      reason:
        typeof lp.reason !== "undefined" ? lp.reason : reason,
      provider:
        typeof lp.provider !== "undefined"
          ? lp.provider
          : provider ?? undefined,
      model:
        typeof lp.model !== "undefined"
          ? lp.model
          : model ?? undefined,
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

    // Precision Plan メトリクス（失敗フェーズ）
    await writerLog({
      phase: "failure",
      model: model ?? undefined,
      durationMs,
      requestId,
    });
  }

  return NextResponse.json(body, { status });
}

/* =========================
   Error Branch Helpers
========================= */

export async function handleInvalidRequestError(
  message: string,
  requestId: string,
  durationMs: number,
) {
  const err = {
    ok: false,
    error: message,
  } as const;

  return sendWriterError({
    reason: "validation",
    status: 400,
    message: err.error,
    requestId,
    provider: null,
    model: null,
    durationMs,
    legacyBody: err,
    logPayload: {
      reason: "validation",
      message: err.error,
    },
  });
}

export async function handlePromptRequiredError(
  provider: string | undefined,
  model: string | undefined,
  requestId: string,
  durationMs: number,
) {
  const message = "prompt is required";

  return sendWriterError({
    reason: "bad_request",
    status: 400,
    message,
    requestId,
    provider: provider ?? null,
    model: model ?? null,
    durationMs,
    legacyBody: {
      ok: false,
      error: message,
    },
    logPayload: {
      reason: "bad_request",
      message,
    },
  });
}

export async function handleUnsupportedProviderError(
  provider: string | undefined,
  model: string | undefined,
  requestId: string,
  durationMs: number,
) {
  const message = `unsupported provider: ${provider ?? "unknown"}`;

  return sendWriterError({
    reason: "bad_request",
    status: 400,
    message,
    requestId,
    provider: provider ?? null,
    model: model ?? null,
    durationMs,
    legacyBody: {
      ok: false,
      error: message,
    },
    logPayload: {
      reason: "bad_request",
      message,
    },
  });
}

export async function handleMissingApiKeyError(
  provider: string | undefined,
  model: string | undefined,
  requestId: string,
  durationMs: number,
) {
  const message = "missing openai api key";

  return sendWriterError({
    reason: "openai",
    status: 500,
    message,
    requestId,
    provider: provider ?? null,
    model: model ?? null,
    durationMs,
    legacyBody: {
      ok: false,
      error: message,
    },
    logPayload: {
      reason: "openai",
      message,
    },
  });
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
}) {
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
    status: status || 502,
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
      message,
      rawError: details,
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
}) {
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
      message: "empty content",
    },
  });
}

export async function handleUnexpectedError(
  e: unknown,
  params: {
    requestId: string;
    provider: string | null;
    model: string | null;
    durationMs: number;
  },
) {
  const { requestId, provider, model, durationMs } = params;
  const message = (e as any)?.message ?? "unexpected error";

  return sendWriterError({
    reason: "internal",
    status: 500,
    message,
    requestId,
    provider,
    model,
    durationMs,
    legacyBody: {
      ok: false,
      error: message,
    },
    logPayload: {
      // 旧ログの reason="exception" を維持しつつ、rawError も記録
      reason: "exception",
      message,
      rawError: e,
    },
  });
}
