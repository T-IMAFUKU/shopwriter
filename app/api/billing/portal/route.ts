// app/api/billing/portal/route.ts
import { NextResponse } from "next/server";

/**
 * 顧客ポータル（Stripe Billing Portal）に遷移するためのセッションを作成する API。
 *
 * smoke / CI では Stripe を触らない（ENV 未設定のため）
 * → POST 時に遅延 import + 環境変数ガード
 */
export async function POST(req: Request) {
  try {
    // smoke / CI ガード（Stripe系ENVが無ければ即OKで返す）
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        {
          ok: true,
          skipped: true,
          reason: "Stripe disabled in smoke/CI",
        },
        { status: 200 },
      );
    }

    // 実行時のみ Stripe を import
    const { stripe } = await import("@/lib/stripe");

    const { customerId } = await req.json().catch(() => ({}));

    if (!customerId) {
      return NextResponse.json(
        { ok: false, error: "Missing customerId" },
        { status: 400 },
      );
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing/return`,
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
    console.error("Portal Error:", message);

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 },
    );
  }
}
