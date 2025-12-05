// app/api/billing/checkout/route.ts
import { NextResponse } from "next/server";
import { stripe, getProPlanPriceId } from "@/lib/stripe";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const priceId = getProPlanPriceId();

    // Stripe Checkout セッションを作成
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing/cancel`,
    });

    return NextResponse.json(
      {
        ok: true,
        url: session.url,
      },
      { status: 200 },
    );
  } catch (err: any) {
    console.error("Checkout Error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: err.message || "Unknown error",
      },
      { status: 500 },
    );
  }
}
