// app/api/writer/route.ts
// ランタイムは nodejs のまま維持すること。
// Prisma / fetch(OpenAI) / ログ など Node.js 依存の処理があるため。
// Precision Plan では "edge" への変更はリスクが高いので禁止。
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { writerLog } from "@/lib/metrics/writerLogger";
import { getProductContextById } from "@/server/products/repository";
import { buildWriterRequestContext } from "./request-parse";
import { sha256Hex, logEvent, emitWriterEvent } from "./_shared/logger";
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

const DEFAULT_WRITER_MODEL = "gpt-5.4-mini";

function paymentRequired(
  reason: BillingGateReason,
  detail: {
    subscriptionStatus: string | null;
    subscriptionCurrentPeriodEnd: string | null;
  },
) {
  return NextResponse.json(
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
  session: unknown,
  rid: string,
  elapsedMs: number,
) {
  const s = session as any;

  const sessionUserId = s?.user?.id ?? null;
  const sessionEmail = s?.user?.email ?? null;

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

function normalizeTemplateKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;

  const low = t.toLowerCase();

  if (low === "lp") return "lp";
  if (low === "email") return "email";
  if (low === "sns_short") return "sns_short";
  if (low === "headline_only") return "headline_only";
  if (low === "sns") return "sns_short";
  if (low === "headline") return "headline_only";

  if (t === "LP") return "lp";
  return low;
}

function normalizeCtaBool(raw: unknown): boolean | null {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw !== 0 : null;
  if (typeof raw !== "string") return null;

  const s = raw.trim().toLowerCase();
  if (!s) return null;

  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "1") return true;
  if (s === "0") return false;

  return null;
}

/* =========================
   ✅ UI必須4項目（別フィールド）を n に反映
========================= */

function S(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

function arrOfStrings(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((x) => S(x)).filter(Boolean);
  const s = S(raw);
  if (!s) return [];
  return s
    .split(/[\n\r]+|[\/／]|[・]|[,，]|[　]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function pickFirst(obj: any, keys: string[]): unknown {
  for (const k of keys) {
    if (!k) continue;
    const v = obj?.[k];
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v.trim().length === 0) continue;
    return v;
  }
  return undefined;
}

function applyUiRequiredFieldsToNormalized(n: any, reqInputAny: any) {
  const root = reqInputAny ?? {};
  const meta = root?.meta ?? {};

  const rawProductName = pickFirst(root, ["productName", "product_name", "product", "name", "title"]);
  const rawGoal = pickFirst(root, ["purpose", "goal", "useCase", "usage", "intent"]);
  const rawSellingPoints = pickFirst(root, ["strengths", "sellingPoints", "selling_points", "features", "featureList"]);
  const rawAudience = pickFirst(root, ["target", "audience", "persona", "customer", "reader"]);

  const rawProductName2 = pickFirst(meta, ["productName", "product_name", "product", "name", "title"]);
  const rawGoal2 = pickFirst(meta, ["purpose", "goal", "useCase", "usage", "intent"]);
  const rawSellingPoints2 = pickFirst(meta, ["strengths", "sellingPoints", "selling_points", "features", "featureList"]);
  const rawAudience2 = pickFirst(meta, ["target", "audience", "persona", "customer", "reader"]);

  const productName = S(rawProductName ?? rawProductName2);
  const goal = S(rawGoal ?? rawGoal2);
  const audience = S(rawAudience ?? rawAudience2);

  const sellingPointsArr = [
    ...arrOfStrings(rawSellingPoints),
    ...arrOfStrings(rawSellingPoints2),
  ];

  if (productName) n.product_name = productName;
  if (goal) n.goal = goal;
  if (audience) n.audience = audience;
  if (sellingPointsArr.length > 0) n.selling_points = sellingPointsArr;

  return {
    productNameLen: productName.length,
    goalLen: goal.length,
    audienceLen: audience.length,
    sellingPointsCount: sellingPointsArr.length,
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

    const { raw: reqInput } = ctxResult.data;

    provider = String((reqInput as any).provider ?? "openai").toLowerCase();
    const rawPrompt = ((reqInput as any).prompt ?? "").toString();
    model = ((reqInput as any).model ?? DEFAULT_WRITER_MODEL).toString();
    const temperature =
      typeof (reqInput as any).temperature === "number"
        ? (reqInput as any).temperature
        : 0.7;

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

    const session = await getServerSession(authOptions);
    const gate = await checkSubscriptionGate(session, rid, elapsed());
    if (!gate.ok) return gate.response;

    const n = normalizeInput(rawPrompt) as any;

    const unsafeRawInput = reqInput as any;
    const meta = unsafeRawInput?.meta ?? null;
    const metaTemplate = normalizeTemplateKey(meta?.template);
    const metaCta = normalizeCtaBool(meta?.cta);

    if (metaCta !== null) {
      n.metaCta = metaCta;
    }

    if (metaTemplate) {
      n.platform = metaTemplate;
    }

    if (metaCta === false) {
      n.cta = null;
    } else if (metaCta === true) {
      if (!n.cta) n.cta = "あり";
    }

    const required4 = applyUiRequiredFieldsToNormalized(n, unsafeRawInput);

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
          metaTemplate: metaTemplate ?? null,
          metaCta: metaCta ?? null,
          productId: productId ?? null,
          required4,
        },
        hash: {
          prompt_sha256_8: sha256Hex(rawPrompt).slice(0, 8),
        },
      };
      logEvent("ok", payloadPre);
      await emitWriterEvent("ok", payloadPre);
    }

    const pipelineResponse = await runWriterPipeline({
      rawPrompt,
      normalized: n,
      provider,
      model,
      temperature,
      apiKey,
      t0,
      requestId: rid,
      elapsed,
      productId,
      productContext,
    });

    if (pipelineResponse?.status === 200) {
      try {
        const payload = await pipelineResponse.clone().json();

        if (payload && payload.ok === true && payload.data && typeof payload.data === "object") {
          const textRaw = (payload.data as any).text;
          const finalText = typeof textRaw === "string" ? textRaw : String(textRaw ?? "");

          (payload.data as any).text = finalText;
          (payload as any).output = finalText;

          return NextResponse.json(payload, { status: 200 });
        }

        return pipelineResponse;
      } catch {
        await emitWriterEvent("ok", {
          phase: "route_json_guard" as const,
          ok: false,
          reason: "PIPELINE_RETURNED_INVALID_JSON",
          requestId: rid,
          durationMs: elapsed(),
          provider: provider ?? null,
          model: model ?? null,
        } as any);

        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "invalid_json_from_pipeline",
              message: "pipeline returned invalid JSON (see server logs / WRITER_EVENT)",
            },
          },
          { status: 500 },
        );
      }
    }

    return pipelineResponse;
  } catch (e: unknown) {
    return handleUnexpectedError(e, {
      requestId: rid,
      provider: provider ?? null,
      model: model ?? null,
      durationMs: elapsed(),
    });
  }
}
