// app/api/writer/route.ts
// ランタイムは nodejs のまま維持すること。
// Prisma / fetch(OpenAI) / ログ など Node.js 依存の処理があるため。
// Precision Plan では "edge" への変更はリスクが高いので禁止。
export const runtime = "nodejs";

import { writerLog } from "@/lib/metrics/writerLogger";
import { prisma } from "@/lib/prisma";
import { getProductContextById } from "@/server/products/repository";
import { getUsageLimitPolicy } from "@/server/usage/usagePolicy";
import type {
  BillingPlan,
  SubscriptionStatus,
  SubscriptionSnapshot,
} from "@/server/usage/usagePolicy";

import { getToken } from "next-auth/jwt";

import { buildWriterRequestContext } from "./request-parse";
import {
  sha256Hex,
  logEvent,
  forceConsoleEvent,
  emitWriterEvent,
} from "./_shared/logger";
import { runWriterPipeline } from "./pipeline";
import { normalizeInput } from "./normalizer";
import {
  handleInvalidRequestError,
  handlePromptRequiredError,
  handleUnsupportedProviderError,
  handleMissingApiKeyError,
  handleUnexpectedError,
} from "./error-layer";

/* =========================
   Route: POST /api/writer

   UsageLimit（観測→適用への最短方針）:
   - /api/writer の入力には購読情報が入らない（meta/prompt/productIdのみ）
   - よって session(JWT) → User(DB) から購読状態を取るのが最短
   - ここではまだ拒否しない（観測のみ）
   - Prisma select は「実在フィールドのみ」を指定する（TS安全）

   テスト注意:
   - Vitest 実行時は next/headers の cookies() が request scope 外で落ちる
   - なので POST(req) の req.headers.get("cookie") を使う（テスト/本番両対応）
========================= */

function parseOptionalDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v : null;
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  if (typeof v === "number") {
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  return null;
}

function toSubscriptionStatus(v: unknown): SubscriptionStatus | null {
  if (typeof v !== "string") return null;
  const s = v.toUpperCase().trim();
  if (s === "NONE") return "NONE";
  if (s === "TRIALING") return "TRIALING";
  if (s === "ACTIVE") return "ACTIVE";
  if (s === "PAST_DUE") return "PAST_DUE";
  if (s === "CANCELED") return "CANCELED";
  if (s === "INACTIVE") return "NONE";
  return null;
}

function toBillingPlan(v: unknown): BillingPlan | null {
  if (typeof v !== "string") return null;
  const s = v.toUpperCase().trim();
  if (s === "FREE") return "FREE";
  if (s === "TRIALING") return "TRIALING";
  if (s === "BASIC_980") return "BASIC_980";
  if (s === "STANDARD_2980") return "STANDARD_2980";
  if (s === "PREMIUM_5980") return "PREMIUM_5980";
  return null;
}

function listTopKeys(obj: unknown, limit = 20): string[] {
  try {
    if (!obj || typeof obj !== "object") return [];
    return Object.keys(obj as Record<string, unknown>).slice(0, limit);
  } catch {
    return [];
  }
}

async function getUserIdFromSessionToken(req: Request): Promise<string | null> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return null;

  const cookieHeader = req.headers.get("cookie") ?? "";
  if (!cookieHeader) return null;

  const token = await getToken({
    req: { headers: { cookie: cookieHeader } } as any,
    secret,
  });

  const sub = token?.sub;
  if (typeof sub === "string" && sub.length > 0) return sub;

  return null;
}

async function getSubscriptionSnapshotFromDb(
  req: Request,
): Promise<{ userId: string | null; sub: SubscriptionSnapshot | null }> {
  const userId = await getUserIdFromSessionToken(req);
  if (!userId) return { userId: null, sub: null };

  // ★ select は「実在フィールドのみ」
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      subscriptionStatus: true,
      subscriptionCurrentPeriodEnd: true,
    },
  });

  if (!user) return { userId, sub: null };

  const status = toSubscriptionStatus((user as any).subscriptionStatus) ?? null;
  const currentPeriodEnd =
    parseOptionalDate((user as any).subscriptionCurrentPeriodEnd) ?? null;

  if (!status && !currentPeriodEnd) return { userId, sub: null };

  return {
    userId,
    sub: {
      status,
      plan: null,
      currentPeriodEnd,
    },
  };
}

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

    const { system: composedSystem, user: composedUser } = composed;

    provider = String(reqInput.provider ?? "openai").toLowerCase();
    const rawPrompt = (reqInput.prompt ?? "").toString();
    model = (reqInput.model ?? "gpt-4o-mini").toString();
    const temperature =
      typeof reqInput.temperature === "number" ? reqInput.temperature : 0.7;
    const systemOverride = (reqInput.system ?? "").toString();

    await writerLog({
      phase: "request",
      model,
      requestId: rid,
    });

    // --- UsageLimit（観測：session→DB→policy） ---
    const { userId, sub } = await getSubscriptionSnapshotFromDb(req);

    if (sub) {
      const policy = getUsageLimitPolicy({ sub });

      await writerLog({
        phase: "usageCheck",
        model,
        requestId: rid,
        usage: {
          userId,
          sub: {
            status: sub.status ?? null,
            plan: sub.plan ?? null,
            currentPeriodEnd: sub.currentPeriodEnd
              ? sub.currentPeriodEnd.toISOString()
              : null,
          },
          policy,
        },
      } as any);

      const payloadUsage = {
        phase: "usageCheck" as const,
        provider,
        model,
        requestId: rid,
        hasSub: true,
        userId,
        sub: {
          status: sub.status ?? null,
          plan: sub.plan ?? null,
          currentPeriodEnd: sub.currentPeriodEnd
            ? sub.currentPeriodEnd.toISOString()
            : null,
        },
        policy,
      };

      logEvent("ok", payloadUsage);
      forceConsoleEvent("ok", payloadUsage);
      await emitWriterEvent("ok", payloadUsage);
    } else {
      const payloadUsageMissing = {
        phase: "usageCheck" as const,
        provider,
        model,
        requestId: rid,
        hasSub: false,
        userId,
        hint: {
          inputKeys: listTopKeys(input),
          rawKeys: listTopKeys(reqInput),
          note:
            "request payload には購読情報なし。session→DB で取得できない場合は未ログイン or NEXTAUTH_SECRET/cookie不一致 or User購読フィールド未設定。",
        },
      };

      logEvent("ok", payloadUsageMissing);
      forceConsoleEvent("ok", payloadUsageMissing);
      await emitWriterEvent("ok", payloadUsageMissing);
    }
    // --- /UsageLimit（観測） ---

    if (!rawPrompt || rawPrompt.trim().length === 0) {
      return handlePromptRequiredError(provider, model, rid, elapsed());
    }

    if (provider !== "openai") {
      return handleUnsupportedProviderError(provider, model, rid, elapsed());
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return handleMissingApiKeyError(provider, model, rid, elapsed());
    }

    const n = normalizeInput(rawPrompt);

    const unsafeRawInput = reqInput as any;
    const rawProductId = unsafeRawInput?.productId;

    let productId: string | null = null;

    if (typeof rawProductId === "string") {
      const trimmed = rawProductId.trim();
      productId = trimmed.length > 0 ? trimmed : null;
    } else if (typeof rawProductId === "number") {
      if (Number.isFinite(rawProductId)) {
        productId = String(rawProductId);
      }
    }

    const productContext = productId
      ? await getProductContextById(productId)
      : null;

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
      productId,
      productContext,
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
