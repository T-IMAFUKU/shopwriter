// app/api/stripe/webhook/route.ts
// Phase D-7: Stripe Webhook → User 購読同期
//
// - runtime=nodejs（Edge では動かさない）
// - Stripe 署名検証（raw body）
// - checkout.session.completed / customer.subscription.updated / invoice.payment_failed などで User を更新
//
// 重要：customer.subscription.updated の payload が薄いケースがあり current_period_end が無いことがある。
//       その場合は Stripe API (subscriptions.retrieve) で補完して subscriptionCurrentPeriodEnd を保存する。
//       さらに、current_period_end の型が number 以外（string/bigint）でも拾えるようにする。

import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";

import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { SubscriptionStatus } from "@prisma/client";

export const runtime = "nodejs";

// ✅ ここで直接 env を読む（@/lib/stripe に依存しない）
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";

// Stripe の Subscription.status を SubscriptionStatus(enum) にマッピング
function mapStripeStatusToSubscriptionStatus(
  status: Stripe.Subscription.Status | string | null | undefined,
): SubscriptionStatus {
  switch (status) {
    case "trialing":
      return SubscriptionStatus.TRIALING;
    case "active":
      return SubscriptionStatus.ACTIVE;
    case "past_due":
    case "unpaid":
    case "paused":
      return SubscriptionStatus.PAST_DUE;
    case "canceled":
      return SubscriptionStatus.CANCELED;
    case "incomplete":
    case "incomplete_expired":
      return SubscriptionStatus.INACTIVE;
    default:
      return SubscriptionStatus.INACTIVE;
  }
}

function unixSecondsToDateTime(unix: number | null | undefined): Date | undefined {
  if (!unix || typeof unix !== "number") return undefined;
  return new Date(unix * 1000);
}

// number/string/bigint を unix秒(number) に正規化
function normalizeUnixSeconds(
  v: unknown,
): { unix: number | undefined; kind: "number" | "string" | "bigint" | "none" } {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) {
    return { unix: v, kind: "number" };
  }
  if (typeof v === "string") {
    const n = Number.parseInt(v, 10);
    if (Number.isFinite(n) && n > 0) return { unix: n, kind: "string" };
    return { unix: undefined, kind: "string" };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof v === "bigint") {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return { unix: n, kind: "bigint" };
    return { unix: undefined, kind: "bigint" };
  }
  return { unix: undefined, kind: "none" };
}

// Checkout Session から user を推定するヘルパー
async function findUserForCheckoutSession(session: Stripe.Checkout.Session) {
  // 1) metadata.userId を最優先
  const metadataUserId = session.metadata?.userId;
  if (metadataUserId) {
    const user = await prisma.user.findUnique({ where: { id: metadataUserId } });
    if (user) return user;
  }

  // 2) client_reference_id に userId を入れているパターン
  if (session.client_reference_id) {
    const user = await prisma.user.findUnique({ where: { id: session.client_reference_id } });
    if (user) return user;
  }

  // 3) customer_details.email から紐付け（最終手段）
  const email = session.customer_details?.email;
  if (email) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) return user;
  }

  return null;
}

// Subscription から user を推定するヘルパー
async function findUserForSubscription(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string | undefined;

  // 1) stripeCustomerId で探す（理想）
  if (customerId) {
    const user = await prisma.user.findUnique({ where: { stripeCustomerId: customerId } });
    if (user) return { user, foundBy: "stripeCustomerId" as const };
  }

  // 2) metadata.userId で探す（フォールバック）
  const metadataUserId = (subscription.metadata as Record<string, string> | null | undefined)?.userId;
  if (metadataUserId) {
    const user = await prisma.user.findUnique({ where: { id: metadataUserId } });
    if (user) return { user, foundBy: "metadata.userId" as const };
  }

  return { user: null, foundBy: "none" as const };
}

async function handleCheckoutSessionCompleted(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;

  const customerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;

  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : (session.subscription as Stripe.Subscription | null)?.id ?? null;

  if (!customerId) {
    console.warn("[stripe-webhook] checkout.session.completed without customer", {
      eventId: event.id,
      sessionId: session.id,
    });
    return;
  }

  const user = await findUserForCheckoutSession(session);

  if (!user) {
    console.warn("[stripe-webhook] No user found for checkout.session.completed", {
      eventId: event.id,
      sessionId: session.id,
      customerId,
    });
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId ?? undefined,
    },
  });

  console.log("[stripe-webhook] Linked user to Stripe customer/subscription", {
    eventId: event.id,
    userId: user.id,
    customerId,
    subscriptionId,
  });
}

// ✅ payloadが薄いケース対策：current_period_end を Stripe API から補完（型も吸収）
async function resolveCurrentPeriodEndUnix(subscription: Stripe.Subscription): Promise<{
  unix: number | undefined;
  source: "event" | "retrieve" | "none";
  rawType: "number" | "string" | "bigint" | "none";
  rawValuePreview: string;
}> {
  const rawFromEvent = (subscription as any)?.current_period_end;
  const nEvent = normalizeUnixSeconds(rawFromEvent);
  if (nEvent.unix) {
    return {
      unix: nEvent.unix,
      source: "event",
      rawType: nEvent.kind,
      rawValuePreview: String(rawFromEvent),
    };
  }

  try {
    const retrieved = await stripe.subscriptions.retrieve(subscription.id);
    const rawFromRetrieve = (retrieved as any)?.current_period_end;
    const nRet = normalizeUnixSeconds(rawFromRetrieve);

    if (nRet.unix) {
      return {
        unix: nRet.unix,
        source: "retrieve",
        rawType: nRet.kind,
        rawValuePreview: String(rawFromRetrieve),
      };
    }

    // 🔎 取れてない時は「生値/型」を出す（原因確定のため）
    console.warn("[stripe-webhook] current_period_end missing/invalid", {
      subscriptionId: subscription.id,
      eventRawType: typeof rawFromEvent,
      eventRawPreview: rawFromEvent == null ? "null" : String(rawFromEvent),
      retrieveRawType: typeof rawFromRetrieve,
      retrieveRawPreview: rawFromRetrieve == null ? "null" : String(rawFromRetrieve),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[stripe-webhook] Failed to retrieve subscription for periodEnd", {
      subscriptionId: subscription.id,
      message,
    });
  }

  return {
    unix: undefined,
    source: "none",
    rawType: "none",
    rawValuePreview: "none",
  };
}

async function handleCustomerSubscriptionUpdated(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;

  const customerId = subscription.customer as string | undefined;
  const subscriptionId = subscription.id;

  const { user, foundBy } = await findUserForSubscription(subscription);

  if (!user) {
    console.warn("[stripe-webhook] No user found for subscription.updated", {
      eventId: event.id,
      customerId,
      subscriptionId,
      subscriptionMetadataUserId: (subscription.metadata as any)?.userId ?? null,
      foundBy,
    });
    return;
  }

  const appStatus = mapStripeStatusToSubscriptionStatus(subscription.status);

  const resolved = await resolveCurrentPeriodEndUnix(subscription);
  const periodEnd = unixSecondsToDateTime(resolved.unix ?? null);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      stripeCustomerId: customerId ?? user.stripeCustomerId ?? undefined,
      stripeSubscriptionId: subscriptionId,
      subscriptionStatus: appStatus,
      subscriptionCurrentPeriodEnd: periodEnd,
    },
  });

  console.log("[stripe-webhook] Updated user subscription from subscription.updated", {
    eventId: event.id,
    userId: user.id,
    foundBy,
    customerId,
    subscriptionId,
    status: subscription.status,
    appStatus,
    periodEnd,
    periodEndSource: resolved.source,
    periodEndRawType: resolved.rawType,
    periodEndRawPreview: resolved.rawValuePreview,
  });
}

async function handleCustomerSubscriptionDeleted(event: Stripe.Event) {
  await handleCustomerSubscriptionUpdated(event);
}

async function handleInvoicePaymentFailed(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;

  const subscriptionId = (invoice as any).subscription as string | null;
  const customerId = (invoice as any).customer as string | null;

  if (!subscriptionId && !customerId) {
    console.warn("[stripe-webhook] invoice.payment_failed without subscription/customer", {
      eventId: event.id,
      invoiceId: invoice.id,
    });
    return;
  }

  let user = null;

  if (subscriptionId) {
    user = await prisma.user.findFirst({ where: { stripeSubscriptionId: subscriptionId } });
  }

  if (!user && customerId) {
    user = await prisma.user.findUnique({ where: { stripeCustomerId: customerId } });
  }

  if (!user) {
    console.warn("[stripe-webhook] No user found for invoice.payment_failed", {
      eventId: event.id,
      invoiceId: invoice.id,
      subscriptionId,
      customerId,
    });
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { subscriptionStatus: SubscriptionStatus.PAST_DUE },
  });

  console.log("[stripe-webhook] Marked user subscription as PAST_DUE from invoice.payment_failed", {
    eventId: event.id,
    userId: user.id,
    invoiceId: invoice.id,
    subscriptionId,
    customerId,
  });
}

export async function POST(req: NextRequest) {
  if (!stripeWebhookSecret) {
    console.error("[stripe-webhook] Missing STRIPE_WEBHOOK_SECRET");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  // ✅ Route Handler では req.headers が最も確実
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, stripeWebhookSecret);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[stripe-webhook] Error verifying webhook signature", { message });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  console.log("[stripe-webhook] received event", { id: event.id, type: event.type });

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(event);
        break;

      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleCustomerSubscriptionUpdated(event);
        break;

      case "customer.subscription.deleted":
        await handleCustomerSubscriptionDeleted(event);
        break;

      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event);
        break;

      default:
        console.log("[stripe-webhook] Unhandled event type", { type: event.type, id: event.id });
        break;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[stripe-webhook] Error handling event", {
      id: event.id,
      type: event.type,
      message,
    });
    // Stripeには200を返す（再送ループ回避）。エラーはログで追う。
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
