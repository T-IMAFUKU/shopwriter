// app/api/writer/route.ts
// ランタイムは nodejs のまま維持すること。
// Prisma / fetch(OpenAI) / ログ など Node.js 依存の処理があるため。
// Precision Plan では "edge" への変更はリスクが高いので禁止。
export const runtime = "nodejs";

import { writerLog } from "@/lib/metrics/writerLogger";
import { getProductContextById } from "@/server/products/repository";
import { buildWriterRequestContext } from "./request-parse";
import { sha256Hex, logEvent, forceConsoleEvent, emitWriterEvent } from "./_shared/logger";
import { runWriterPipeline } from "./pipeline";
import { normalizeInput } from "./normalizer";
import {
  handleInvalidRequestError,
  handlePromptRequiredError,
  handleUnsupportedProviderError,
  handleMissingApiKeyError,
  handleUnexpectedError,
} from "./error-layer";

// --- ✅ Billing Gate (Stripe subscriptionStatus) ---
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

type BillingGateReason = "PAST_DUE" | "CANCELED_PERIOD_ENDED" | "UNKNOWN_STATUS";

function paymentRequired(
  reason: BillingGateReason,
  detail: {
    subscriptionStatus: string | null;
    subscriptionCurrentPeriodEnd: string | null;
  },
) {
  return Response.json(
    {
      ok: false,
      error: {
        code: "payment_required",
        reason,
        ...detail,
      },
    },
    { status: 402 },
  );
}

function isLikelyCuid(id: unknown): id is string {
  if (typeof id !== "string") return false;
  return id.length >= 20 && id.startsWith("c");
}

async function checkSubscriptionGate(
  session: unknown, // ✅ 型ズレ回避（最短で動作を確定する）
  rid: string,
  elapsedMs: number,
) {
  const s = session as any;

  const sessionUserId = s?.user?.id ?? null;
  const sessionEmail = s?.user?.email ?? null;

  // セッションが無ければ「無料扱い」= ここでは止めない
  if (!s || (!sessionEmail && !sessionUserId)) {
    await emitWriterEvent("ok", {
      phase: "billing_gate" as const,
      ok: true,
      reason: "NO_SESSION",
      requestId: rid,
      durationMs: elapsedMs,
    } as any);
    return { ok: true as const };
  }

  // email を第一優先にする（GitHub数値IDが混ざるため）
  let u:
    | {
        subscriptionStatus: string | null;
        subscriptionCurrentPeriodEnd: Date | null;
      }
    | null = null;

  if (typeof sessionEmail === "string" && sessionEmail.length > 0) {
    u = await prisma.user.findUnique({
      where: { email: sessionEmail },
      select: {
        subscriptionStatus: true,
        subscriptionCurrentPeriodEnd: true,
      },
    });
  } else if (isLikelyCuid(sessionUserId)) {
    u = await prisma.user.findUnique({
      where: { id: sessionUserId },
      select: {
        subscriptionStatus: true,
        subscriptionCurrentPeriodEnd: true,
      },
    });
  }

  // DBに居ないなら無料扱い（ここでは止めない）
  if (!u) {
    await emitWriterEvent("ok", {
      phase: "billing_gate" as const,
      ok: true,
      reason: "USER_NOT_FOUND",
      requestId: rid,
      durationMs: elapsedMs,
      sessionEmail: sessionEmail ?? null,
      sessionUserId: typeof sessionUserId === "string" ? sessionUserId : null,
    } as any);
    return { ok: true as const };
  }

  const statusRaw = u.subscriptionStatus ?? null;
  const status = statusRaw ? String(statusRaw).toUpperCase() : null;

  const periodEndDate = u.subscriptionCurrentPeriodEnd ?? null;
  const periodEndIso = periodEndDate ? new Date(periodEndDate).toISOString() : null;

  if (status === "PAST_DUE") {
    await emitWriterEvent("ok", {
      phase: "billing_gate" as const,
      ok: false,
      reason: "PAST_DUE",
      requestId: rid,
      durationMs: elapsedMs,
      subscriptionStatus: status,
      subscriptionCurrentPeriodEnd: periodEndIso,
    } as any);

    return {
      ok: false as const,
      response: paymentRequired("PAST_DUE", {
        subscriptionStatus: status,
        subscriptionCurrentPeriodEnd: periodEndIso,
      }),
    };
  }

  if (status === "CANCELED") {
    if (!periodEndDate) {
      await emitWriterEvent("ok", {
        phase: "billing_gate" as const,
        ok: false,
        reason: "CANCELED_PERIOD_ENDED",
        requestId: rid,
        durationMs: elapsedMs,
        subscriptionStatus: status,
        subscriptionCurrentPeriodEnd: null,
      } as any);

      return {
        ok: false as const,
        response: paymentRequired("CANCELED_PERIOD_ENDED", {
          subscriptionStatus: status,
          subscriptionCurrentPeriodEnd: null,
        }),
      };
    }

    const now = Date.now();
    const end = new Date(periodEndDate).getTime();

    if (!Number.isFinite(end) || now > end) {
      await emitWriterEvent("ok", {
        phase: "billing_gate" as const,
        ok: false,
        reason: "CANCELED_PERIOD_ENDED",
        requestId: rid,
        durationMs: elapsedMs,
        subscriptionStatus: status,
        subscriptionCurrentPeriodEnd: periodEndIso,
      } as any);

      return {
        ok: false as const,
        response: paymentRequired("CANCELED_PERIOD_ENDED", {
          subscriptionStatus: status,
          subscriptionCurrentPeriodEnd: periodEndIso,
        }),
      };
    }
  }

  await emitWriterEvent("ok", {
    phase: "billing_gate" as const,
    ok: true,
    reason: "PASS",
    requestId: rid,
    durationMs: elapsedMs,
    subscriptionStatus: status,
    subscriptionCurrentPeriodEnd: periodEndIso,
  } as any);

  return { ok: true as const };
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

    const { composed, raw: reqInput } = ctxResult.data;
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

    // ✅ 課金ゲート（ここで止める）
    const session = await getServerSession(authOptions);
    const gate = await checkSubscriptionGate(session, rid, elapsed());
    if (!gate.ok) return gate.response;

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

    const productContext = productId ? await getProductContextById(productId) : null;

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
