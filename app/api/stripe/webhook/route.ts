// app/api/stripe/webhook/route.ts
// Stripe Webhook 受信用エンドポイント（Phase1: 受信＆ログのみ）
//
// 注意:
// - まだ Stripe ダッシュボード側の Webhook 設定は行わない前提のスタブ実装。
// - DB 更新や課金ステータスの変更は後続フェーズで実装する。
// - 現段階ではイベントを検証し、ログを出して 200 を返すだけ。

import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs"; // Webhook は Edge ではなく Node.js ランタイムで動かす

// Stripe Webhook 用シークレット（まだ未設定でも動くように、必須にはしない）
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";

async function readRawBody(req: Request): Promise<string> {
  // Next.js App Router の Request から生のテキストを取得
  return await req.text();
}

export async function POST(req: Request) {
  // Stripe-Signature ヘッダーを取得
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json(
      { ok: false, error: "Missing Stripe-Signature header" },
      { status: 400 },
    );
  }

  if (!webhookSecret) {
    // まだ Webhook シークレットが設定されていない場合は、検証せずに 500 を返す。
    console.error(
      "[Stripe Webhook] STRIPE_WEBHOOK_SECRET is not set. " +
        "Skip verification and return 500.",
    );
    return NextResponse.json(
      { ok: false, error: "Webhook secret not configured" },
      { status: 500 },
    );
  }

  let event: Stripe.Event;

  try {
    const rawBody = await readRawBody(req);

    // Stripe 公式の検証ロジックでイベントを構築
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      sig,
      webhookSecret,
    );
  } catch (err: any) {
    console.error("[Stripe Webhook] Signature verification failed:", err);
    return NextResponse.json(
      { ok: false, error: "Signature verification failed" },
      { status: 400 },
    );
  }

  try {
    // ここからイベント種別ごとの処理（Phase1 ではログのみ）
    switch (event.type) {
      case "checkout.session.completed":
        console.log("[Stripe Webhook] checkout.session.completed", event.id);
        break;

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        console.log("[Stripe Webhook] subscription event", {
          type: event.type,
          id: event.id,
        });
        break;

      default:
        console.log("[Stripe Webhook] unhandled event type", event.type);
        break;
    }

    // Stripe には 2xx を返せば OK とみなされる
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err: any) {
    console.error("[Stripe Webhook] Handler error:", err);
    return NextResponse.json(
      { ok: false, error: "Handler error" },
      { status: 500 },
    );
  }
}
