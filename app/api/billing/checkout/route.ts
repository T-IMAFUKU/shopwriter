// app/api/billing/checkout/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * 正本方針（Webhook前提・恒久対策）
 * - 「誰の契約か」を Stripe に必ず残す（metadata.userId / client_reference_id）
 * - userId が取れない Checkout は作らない（unknown禁止）
 * - planCode ↔ priceId はこの route.ts で正規化する
 *
 * 正本（確定）:
 * - STRIPE_PRICE_BASIC_980_MONTHLY
 * - STRIPE_PRICE_STANDARD_2980_MONTHLY
 * - STRIPE_PRICE_PREMIUM_5980_MONTHLY
 *
 * 互換:
 * - STRIPE_PRICE_ID_{BASIC|STANDARD|PREMIUM}_{TEST|PROD}
 */

type PlanCode = "basic" | "standard" | "premium";

function getAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL ??
    "http://localhost:3000"
  );
}

function isProdEnv(): boolean {
  return (
    process.env.VERCEL_ENV === "production" ||
    process.env.NODE_ENV === "production"
  );
}

function safeString(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s.length ? s : undefined;
}

function getPlanCodeFromBody(body: unknown): PlanCode {
  const raw =
    typeof body === "object" && body !== null
      ? safeString((body as Record<string, unknown>).planCode)
      : undefined;

  if (raw === "basic" || raw === "standard" || raw === "premium") return raw;

  // UI変更しないため既定は standard
  return "standard";
}

function getMonthlyEnvKey(planCode: PlanCode): string {
  return planCode === "basic"
    ? "STRIPE_PRICE_BASIC_980_MONTHLY"
    : planCode === "premium"
      ? "STRIPE_PRICE_PREMIUM_5980_MONTHLY"
      : "STRIPE_PRICE_STANDARD_2980_MONTHLY";
}

function getPriceId(planCode: PlanCode): string {
  const monthlyKey = getMonthlyEnvKey(planCode);
  const monthly = process.env[monthlyKey];
  if (monthly && monthly.trim()) return monthly.trim();

  const prod = isProdEnv();
  const fallbackKey =
    planCode === "basic"
      ? prod
        ? "STRIPE_PRICE_ID_BASIC_PROD"
        : "STRIPE_PRICE_ID_BASIC_TEST"
      : planCode === "premium"
        ? prod
          ? "STRIPE_PRICE_ID_PREMIUM_PROD"
          : "STRIPE_PRICE_ID_PREMIUM_TEST"
        : prod
          ? "STRIPE_PRICE_ID_STANDARD_PROD"
          : "STRIPE_PRICE_ID_STANDARD_TEST";

  const fallback = process.env[fallbackKey];
  if (!fallback || !fallback.trim()) {
    throw new Error(
      `Missing Stripe price env: ${monthlyKey} (canonical) or ${fallbackKey} (fallback)`,
    );
  }
  return fallback.trim();
}

export async function POST(req: Request) {
  try {
    // Stripe未設定は 503（smoke/CI を落とさない）
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { ok: false, error: "Stripe is not configured" },
        { status: 503 },
      );
    }

    // ✅ 恒久対策：Checkoutは「必ずログイン済みユーザー」からしか作らせない
    const session = await getServerSession(authOptions);
    const email = session?.user?.email ?? null;
    if (!email) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    // ✅ ShopWriterのDB上の User.id を正とする（GitHub id等に依存しない）
    const appUser = await prisma.user.findUnique({ where: { email } });
    if (!appUser) {
      return NextResponse.json(
        { ok: false, error: "User not found" },
        { status: 404 },
      );
    }

    // body は optional（UI変更しない）
    const body = await req.json().catch(() => ({}));
    const planCode = getPlanCodeFromBody(body);
    const envLabel = isProdEnv() ? "prod" : "test";

    // ✅ 遅延 import（smoke対策の要）
    const { stripe } = await import("@/lib/stripe");

    const priceId = getPriceId(planCode);
    const appUrl = getAppUrl();

    // ✅ 恒久対策：Webhookが100%回収できるキー
    const userId = appUser.id; // ← これが最重要
    const userKey = userId; // 互換のため残す（unknownは禁止）

    const sessionCreated = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      allow_promotion_codes: true,
      automatic_tax: { enabled: true },

      line_items: [{ price: priceId, quantity: 1 }],

      success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/billing/cancel`,

      // ✅ ここが「壊れて見逃された」根本：必須フィールドを必ず入れる
      client_reference_id: userId,

      // （任意）Stripe側で請求書メール等にも使われる
      customer_email: email,

      metadata: {
        // Webhookが最優先で見るキー
        userId,
        // 互換キー（残すが unknown 禁止）
        userKey,
        planCode,
        env: envLabel,
        source: "shopwriter",
      },

      subscription_data: {
        metadata: {
          userId,
          userKey,
          planCode,
          env: envLabel,
          source: "shopwriter",
        },
      },
    });

    if (!sessionCreated.url) {
      throw new Error("Stripe Checkout session.url is null");
    }

    return NextResponse.json({ ok: true, url: sessionCreated.url }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Checkout Error:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
