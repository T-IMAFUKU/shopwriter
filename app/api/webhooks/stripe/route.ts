// app/api/webhooks/stripe/route.ts
// Stripe Webhook → User サブスクリプション状態更新ハンドラ
//
// 方針（恒久）:
// - DB直操作運用は禁止（Stripeの事実へ収束させる）
// - Webhook を一次同期、取りこぼしは別途「再同期」で吸収（別テーマ）
// - 署名検証済みの想定外イベントは 200(ok:true) で返す

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
      // 1) Checkout 完了：User と Stripe Customer/Subscription を紐付け
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(event);
        break;

      // 2) Subscription 変更：サブスク状態の真実を同期
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await handleCustomerSubscriptionChange(event);
        break;

      // 3) Customer 削除：DB 側の Stripe 紐付けをクリアして収束
      case "customer.deleted":
        await handleCustomerDeleted(event);
        break;

      // 4) Invoice（支払結果）：取りこぼし防止の保険として Subscription を再取得して同期
      //    - payment_failed: PAST_DUE などへ遷移している可能性
      //    - payment_succeeded: ACTIVE に戻る/維持の可能性
      case "invoice.payment_failed":
      case "invoice.payment_succeeded":
        await handleInvoicePaymentEvent(event);
        break;

      default:
        // 想定外イベントは無視（署名検証済みなので 200 を返す）
        break;
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown handler error";
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
  await syncSubscriptionToUsers(subscription);
}

/**
 * customer.deleted
 * - Stripe 側で顧客が削除された場合、DB 側の紐付けをクリアして「Stripeの事実」に収束させる
 * - 「Stripeでは顧客が無いのに利用停止が残る」問題の根本対策
 */
async function handleCustomerDeleted(event: Stripe.Event) {
  const customer = event.data.object as Stripe.Customer;

  const customerId = customer.id;
  if (!customerId) return;

  const result = await prisma.user.updateMany({
    where: { stripeCustomerId: customerId },
    data: {
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionStatus: SubscriptionStatus.INACTIVE,
      subscriptionCurrentPeriodEnd: null,
    },
  });

  if (result.count === 0) {
    console.warn("[stripe-webhook] customer.deleted: No user updated", {
      customerId,
    });
  }
}

/**
 * invoice.payment_failed / invoice.payment_succeeded
 * - 直接DBを支払イベントで更新するのではなく、subscription を再取得して「真実」を同期する
 * - Stripe の Invoice 型定義は環境差があるため、実行時チェックで安全に抽出する
 */
async function handleInvoicePaymentEvent(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;

  const { subscriptionId, customerId } = extractInvoiceRefs(invoice);

  if (!subscriptionId) {
    // サブスクに紐づかない請求は対象外
    return;
  }

  await syncSubscriptionById(subscriptionId, customerId);
}

/**
 * Stripe.Invoice から subscription/customer を型差異込みで安全に取り出す
 */
function extractInvoiceRefs(invoice: Stripe.Invoice): {
  subscriptionId: string | null;
  customerId: string | null;
} {
  const anyInvoice = invoice as unknown as {
    subscription?: unknown;
    customer?: unknown;
  };

  const sub = anyInvoice.subscription;
  const cus = anyInvoice.customer;

  const subscriptionId =
    typeof sub === "string"
      ? sub
      : typeof (sub as any)?.id === "string"
        ? ((sub as any).id as string)
        : null;

  const customerId =
    typeof cus === "string"
      ? cus
      : typeof (cus as any)?.id === "string"
        ? ((cus as any).id as string)
        : null;

  return { subscriptionId, customerId };
}

/**
 * subscriptionId から Stripe へ再取得して同期する（確実性優先）
 * - resource_missing 等で取得できない場合は、customerId があれば紐付けクリアへ寄せる
 */
async function syncSubscriptionById(
  subscriptionId: string,
  customerId: string | null,
) {
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    await syncSubscriptionToUsers(subscription);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.warn("[stripe-webhook] syncSubscriptionById failed", {
      subscriptionId,
      customerId,
      message,
    });

    // subscription が取れない = Stripe側で既に消えている可能性
    // customerId が分かるなら、Stripe事実に収束（紐付けクリア）
    if (customerId) {
      await prisma.user.updateMany({
        where: { stripeCustomerId: customerId },
        data: {
          stripeSubscriptionId: null,
          subscriptionStatus: SubscriptionStatus.INACTIVE,
          subscriptionCurrentPeriodEnd: null,
        },
      });
    }
  }
}

/**
 * Stripe.Subscription を User へ同期する（SSOT：Stripe）
 */
async function syncSubscriptionToUsers(subscription: Stripe.Subscription) {
  const subscriptionId = subscription.id;

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  const currentPeriodEndUnix = (subscription as any).current_period_end as
    | number
    | null
    | undefined;

  const status = mapStripeStatus(subscription.status);

  const currentPeriodEnd = currentPeriodEndUnix
    ? new Date(currentPeriodEndUnix * 1000)
    : null;

  const updateData = {
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    subscriptionStatus: status,
    subscriptionCurrentPeriodEnd: currentPeriodEnd,
  };

  // まず subscriptionId でユーザーを特定
  const resultBySub = await prisma.user.updateMany({
    where: { stripeSubscriptionId: subscriptionId },
    data: updateData,
  });

  if (resultBySub.count > 0) {
    return;
  }

  // まだ subscriptionId が紐付いていない場合は customerId で同期
  const resultByCustomer = await prisma.user.updateMany({
    where: { stripeCustomerId: customerId },
    data: updateData,
  });

  if (resultByCustomer.count === 0) {
    console.warn("[stripe-webhook] No user updated for subscription event", {
      subscriptionId,
      customerId,
      status: subscription.status,
    });
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
