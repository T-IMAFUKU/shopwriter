// app/api/billing/checkout/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function getAppUrl(): string {
  // 本番/Preview で NEXT_PUBLIC_APP_URL を推奨
  // 未設定でも build を落とさない（smoke 対策）
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export async function POST(req: Request) {
  try {
    // smoke/CI では Stripe を触らない（env が無いときは 503）
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        {
          ok: false,
          error: "Stripe is not configured",
        },
        { status: 503 },
      );
    }

    // body は将来用（現状は使わないが壊さない）
    await req.json().catch(() => ({}));

    // ✅ 遅延 import（ここがsmoke対策の要）
    const { stripe, getProPlanPriceId } = await import("@/lib/stripe");

    const priceId = getProPlanPriceId();

    const appUrl = getAppUrl();

    // Stripe Checkout セッションを作成
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      // ✅ 100%OFFクーポン（プロモコード）入力欄をCheckoutに表示する
      allow_promotion_codes: true,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/billing/cancel`,
    });

    return NextResponse.json(
      {
        ok: true,
        url: session.url,
      },
      { status: 200 },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Checkout Error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 },
    );
  }
}
