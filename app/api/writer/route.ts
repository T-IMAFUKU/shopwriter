// ランタイムは nodejs のまま維持すること。
// Prisma / fetch(OpenAI) / ログ など Node.js 依存の処理があるため。
// Precision Plan では "edge" への変更はリスクが高いので禁止。
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { writerLog } from "@/lib/metrics/writerLogger";
import { buildWriterRequestContext } from "./request-parse";
import {
  sha256Hex,
  logEvent,
  forceConsoleEvent,
  emitWriterEvent,
} from "./_shared/logger";
import { runWriterPipeline } from "./pipeline";

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
async function sendWriterError(
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

    // Precision Plan メトリクス（失敗フェーズ）※ここが今回の修正ポイント
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
   Normalizer（入力正規化）
========================= */

type NormalizedInput = {
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

// JSON/自由文を NormalizedInput に揃える
function normalizeInput(raw: string | undefined): NormalizedInput {
  const txt = (raw ?? "").toString().trim();

  // 1) JSONとみなせるなら優先してJSON parse
  if (txt.startsWith("{") || txt.startsWith("[")) {
    try {
      const j = JSON.parse(txt);
      const obj = Array.isArray(j) ? j[0] ?? {} : j ?? {};
      return coerceToShape(obj, txt);
    } catch {
      // JSONじゃなかったときはフォールバック
    }
  }

  const lower = txt.toLowerCase();
  const pick = (re: RegExp, def = "") => {
    const m = re.exec(txt);
    return (m?.[1] ?? def).toString().trim();
  };

  const category = pick(/カテゴリ[：:]\s*(.+)/i, "");
  const goal = pick(/目的[：:]\s*(.+)/i, "");
  const audience = pick(/ターゲット[：:]\s*(.+)/i, "");
  const platform =
    pick(/媒体[：:]\s*(.+)/i, "") ||
    (/(lp|ランディングページ)/i.test(lower) ? "lp" : null);

  const keywordsMatch = txt.match(/キーワード[：:]\s*(.+)/i);
  const keywords =
    keywordsMatch?.[1]
      ?.split(/[、,]/)
      .map((s) => s.trim())
      .filter(Boolean) ?? [];

  const constraintsMatch = txt.match(/制約条件[：:]\s*(.+)/i);
  const constraints =
    constraintsMatch?.[1]
      ?.split(/[、,]/)
      .map((s) => s.trim())
      .filter(Boolean) ?? [];

  const sellingPointsMatch = txt.match(/セールスポイント[：:]\s*(.+)/i);
  const selling_points =
    sellingPointsMatch?.[1]
      ?.split(/[、,]/)
      .map((s) => s.trim())
      .filter(Boolean) ?? [];

  const objectionsMatch = txt.match(/よくある不安[：:]\s*(.+)/i);
  const objections =
    objectionsMatch?.[1]
      ?.split(/[、,]/)
      .map((s) => s.trim())
      .filter(Boolean) ?? [];

  const evidenceMatch = txt.match(/根拠[：:]\s*(.+)/i);
  const evidence =
    evidenceMatch?.[1]
      ?.split(/[、,]/)
      .map((s) => s.trim())
      .filter(Boolean) ?? [];

  const ctaPrefMatch = txt.match(/CTA希望[：:]\s*(.+)/i);
  const cta_preference =
    ctaPrefMatch?.[1]
      ?.split(/[、,]/)
      .map((s) => s.trim())
      .filter(Boolean) ?? [];

  return coerceToShape(
    {
      product_name: pick(/商品名[：:]\s*(.+)/i, ""),
      category,
      goal,
      audience,
      platform,
      keywords,
      constraints,
      brand_voice: pick(/ブランドボイス[：:]\s*(.+)/i, ""),
      tone: pick(/トーン[：:]\s*(.+)/i, ""),
      style: pick(/スタイル[：:]\s*(.+)/i, ""),
      length_hint: pick(/ボリューム[：:]\s*(.+)/i, ""),
      selling_points,
      objections,
      evidence,
      cta_preference,
    },
    txt,
  );
}

// 任意オブジェクトを NormalizedInput shape に寄せる
function coerceToShape(obj: any, raw: string): NormalizedInput {
  const s = (v: unknown) => (v == null ? "" : String(v));
  const arr = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.map((x) => String(x)).filter((x) => x.trim().length > 0)
      : typeof v === "string"
        ? v
            .split(/[、,]/)
            .map((x) => x.trim())
            .filter(Boolean)
        : [];

  return {
    product_name: s(obj.product_name || obj.title || obj.name),
    category: s(obj.category),
    goal: s(obj.goal),
    audience: s(obj.audience),
    platform: obj.platform ? String(obj.platform) : null,
    keywords: arr(obj.keywords),
    constraints: arr(obj.constraints),
    brand_voice: obj.brand_voice ? String(obj.brand_voice) : null,
    tone: obj.tone ? String(obj.tone) : null,
    style: obj.style ? String(obj.style) : null,
    length_hint: obj.length_hint ? String(obj.length_hint) : null,
    selling_points: arr(obj.selling_points),
    objections: arr(obj.objections),
    evidence: arr(obj.evidence),
    cta_preference: arr(obj.cta_preference),
    _raw: raw,
  };
}

/* =========================
   Error Branch Helpers
========================= */

async function handleInvalidRequestError(
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

async function handlePromptRequiredError(
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

async function handleUnsupportedProviderError(
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

async function handleMissingApiKeyError(
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

async function handleOpenAIApiError(params: {
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

async function handleEmptyContentError(params: {
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

async function handleUnexpectedError(
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

/* =========================
   Route: POST /api/writer
========================= */

export async function POST(req: Request) {
  const t0 = Date.now();
  const rid =
    (globalThis as any).crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2);

  const elapsed = () => Date.now() - t0;

  let model: string | undefined;
  let provider: string | undefined;

  try {
    const ctxResult = await buildWriterRequestContext(req);

    if (!ctxResult.ok) {
      return handleInvalidRequestError(
        ctxResult.error?.message ?? "invalid request",
        rid,
        elapsed(),
      );
    }

    const { input, composed, raw: reqInput } = ctxResult.data;

    const {
      system: composedSystem,
      user: composedUser,
    } = composed;

    provider = String(reqInput.provider ?? "openai").toLowerCase();
    const rawPrompt = (reqInput.prompt ?? "").toString();
    model = (reqInput.model ?? "gpt-4o-mini").toString();
    const temperature =
      typeof reqInput.temperature === "number"
        ? reqInput.temperature
        : 0.7;
    const systemOverride = (reqInput.system ?? "").toString();

    await writerLog({
      phase: "request",
      model,
      requestId: rid,
    });

    if (!rawPrompt || rawPrompt.trim().length === 0) {
      return handlePromptRequiredError(
        provider,
        model,
        rid,
        elapsed(),
      );
    }

    if (provider !== "openai") {
      return handleUnsupportedProviderError(
        provider,
        model,
        rid,
        elapsed(),
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return handleMissingApiKeyError(
        provider,
        model,
        rid,
        elapsed(),
      );
    }

    const n = normalizeInput(rawPrompt);

    {
      const payloadPre = {
        phase: "precompose" as const,
        provider,
        model,
        input: {
          category: n.category,
          goal: n.goal,
          platform: n.platform ?? null,
        },
        hash: {
          prompt_sha256_8: sha256Hex(rawPrompt).slice(0, 8),
        },
      };
      logEvent("ok", payloadPre);
      forceConsoleEvent("ok", payloadPre);
      await emitWriterEvent("ok", payloadPre);
    }

    // 🆕 正常系本体は runWriterPipeline に委譲
    return runWriterPipeline({
      rawPrompt,
      normalized: n,
      provider,
      model,
      temperature,
      systemOverride,
      composedSystem,
      composedUser,
      apiKey,
      t0,
      requestId: rid,
      elapsed,
    });
  } catch (e: unknown) {
    return handleUnexpectedError(e, {
      requestId: rid,
      provider: provider ?? null,
      model: model ?? null,
      durationMs: elapsed(),
    });
  }
}
