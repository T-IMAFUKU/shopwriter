// app/api/webhooks/stripe/route.ts
// Stripe Webhook → User サブスクリプション状態更新ハンドラ

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { SubscriptionStatus } from "@prisma/client";

export const runtime = "nodejs";

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(req: Request) {
  if (!webhookSecret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set");
    return new NextResponse("Webhook secret not configured", { status: 500 });
  }

  const signature = headers().get("stripe-signature");
  if (!signature) {
    console.warn("[stripe-webhook] Missing stripe-signature header");
    return new NextResponse("Missing stripe-signature header", { status: 400 });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error verifying signature";
    console.error("[stripe-webhook] Signature verification failed", message);
    return new NextResponse(`Webhook Error: ${message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(event);
        break;

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await handleCustomerSubscriptionChange(event);
        break;

      default:
        // 想定外イベントは無視（署名検証済みなので 200 を返す）
        break;
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown handler error";
    console.error("[stripe-webhook] Handler error", {
      type: event.type,
      message,
    });
    return new NextResponse("Internal error", { status: 500 });
  }
}

/**
 * checkout.session.completed
 * - 初回サブスク登録時に、User と Stripe Customer / Subscription を紐付ける
 * - /api/billing/checkout 側で session.metadata.userId に User.id を入れている前提
 */
async function handleCheckoutSessionCompleted(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;

  if (session.mode !== "subscription") {
    return;
  }

  const userId = session.metadata?.userId;
  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? undefined;

  if (!userId || !customerId || !subscriptionId) {
    console.warn("[stripe-webhook] checkout.session.completed missing fields", {
      userId,
      customerId,
      subscriptionId,
    });
    return;
  }

  // User が存在しないケースでは何もせずログだけ残す
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (!user) {
    console.warn("[stripe-webhook] User not found for checkout.session", {
      userId,
      customerId,
      subscriptionId,
    });
    return;
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
    },
  });
}

/**
 * customer.subscription.created / updated / deleted
 * - サブスク状態と期間の「真実」を User テーブルに同期する
 * - 原則 stripeSubscriptionId で User を特定し、fallback として stripeCustomerId でも探す
 */
async function handleCustomerSubscriptionChange(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;

  const subscriptionId = subscription.id;

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  // Stripe.Subscription 型には current_period_* が含まれている前提
  const currentPeriodEndUnix =
  (subscription as any).current_period_end as number | null | undefined;

  const status = mapStripeStatus(subscription.status);

  const currentPeriodEnd = currentPeriodEndUnix
    ? new Date(currentPeriodEndUnix * 1000)
    : null;

  const updateData = {
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    subscriptionStatus: status,
    subscriptionCurrentPeriodEnd: currentPeriodEnd ?? undefined,
  };

  // まず subscriptionId でユーザーを特定
  const resultBySub = await prisma.user.updateMany({
    where: { stripeSubscriptionId: subscriptionId },
    data: updateData,
  });

  if (resultBySub.count > 0) {
    return;
  }

  // まだ subscriptionId が紐付いていない（過去データ / 初期導入直後など）の場合は
  // customerId から推測して同期する
  const resultByCustomer = await prisma.user.updateMany({
    where: { stripeCustomerId: customerId },
    data: updateData,
  });

  if (resultByCustomer.count === 0) {
    console.warn(
      "[stripe-webhook] No user updated for subscription event",
      {
        subscriptionId,
        customerId,
        status: subscription.status,
      },
    );
  }
}

/**
 * Stripe の Subscription.status → Prisma 側の SubscriptionStatus enum へのマッピング
 */
function mapStripeStatus(
  stripeStatus: Stripe.Subscription.Status,
): SubscriptionStatus {
  switch (stripeStatus) {
    case "trialing":
      return SubscriptionStatus.TRIALING;
    case "active":
      return SubscriptionStatus.ACTIVE;
    case "past_due":
    case "unpaid":
      return SubscriptionStatus.PAST_DUE;
    case "canceled":
      return SubscriptionStatus.CANCELED;
    default:
      return SubscriptionStatus.INACTIVE;
  }
}
