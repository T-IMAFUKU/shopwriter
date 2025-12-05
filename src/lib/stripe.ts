// src/lib/stripe.ts
// Stripe クライアントのシングルトン（サーバーサイド専用）
// - /api/* の Route Handler や Server Action からのみ利用する想定
// - クライアントコンポーネントからは直接 import しないこと

import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY;

if (!secretKey) {
  // ビルド／起動時にすぐ気づけるよう、ここで fail-fast させる
  throw new Error(
    "Missing STRIPE_SECRET_KEY environment variable. " +
      "Set it in your .env.local / Vercel Project Env before using Stripe.",
  );
}

/**
 * Stripe の公式 Node.js SDK クライアント。
 *
 * メモ:
 * - apiVersion は SDK / アカウント側のデフォルトを利用する。
 * - 明示的にバージョンを固定したくなったら、オプションで apiVersion を指定する。
 */
export const stripe = new Stripe(secretKey, {
  // 例: 明示的に固定したくなったらコメントアウトを外す
  // apiVersion: "2024-06-20",
});

/**
 * ShopWriter 有料プラン（Pro）の Price ID を取得するヘルパー。
 *
 * - STRIPE_PRICE_ID_PRO が未設定の場合はエラーにして fail-fast。
 * - Checkout セッション作成時などに利用することを想定。
 */
export function getProPlanPriceId(): string {
  const priceId = process.env.STRIPE_PRICE_ID_PRO;

  if (!priceId) {
    throw new Error(
      "Missing STRIPE_PRICE_ID_PRO environment variable. " +
        "Set it in your .env.local / Vercel Project Env to the price_xxx ID for ShopWriter Pro.",
    );
  }

  return priceId;
}

/**
 * 公開可能キー（Publishable key）を取得するヘルパー。
 *
 * - クライアント側で Stripe.js を初期化したい場合に使う。
 * - サーバーサイドのみで使うケースもあるため、ここでは throw せずに undefined を許容する。
 */
export function getStripePublishableKey(): string | undefined {
  return process.env.STRIPE_PUBLISHABLE_KEY;
}
