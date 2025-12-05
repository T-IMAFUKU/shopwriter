// app/api/billing/portal/route.ts
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

/**
 * 顧客ポータル（Stripe Billing Portal）に遷移するためのセッションを作成する API。
 * 
 * 最小構成版：
 * - Stripe Customer ID は「Checkout成功時に自動作成されるもの」を使用
 * - 将来、NextAuth.user.id と Stripe customer.id の紐付けをDBに保存するフェーズで拡張予定
 */
export async function POST(req: Request) {
  try {
    // 顧客情報の取得（必要に応じて拡張）
    const { customerId } = await req.json().catch(() => ({}));

    if (!customerId) {
      return NextResponse.json(
        { ok: false, error: "Missing customerId" },
        { status: 400 },
      );
    }

    // 顧客ポータルのセッションを作成
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
  } catch (err: any) {
    console.error("Portal Error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: err.message || "Unknown error",
      },
      { status: 500 },
    );
  }
}
