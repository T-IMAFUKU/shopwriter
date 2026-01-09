// app/api/billing/checkout/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * 正本方針（Webhook前提）
 * - planCode ↔ priceId をこの route.ts で正規化する（lib側の曖昧取得に依存しない）
 * - metadata を Checkout Session / Subscription に付与し、Webhookで確実に回収できる形にする
 * - 本番/テスト判定を明示し、priceId の参照先（ENV）を切り替える
 *
 * 正本（確定）:
 * - STRIPE_PRICE_BASIC_980_MONTHLY
 * - STRIPE_PRICE_STANDARD_2980_MONTHLY
 * - STRIPE_PRICE_PREMIUM_5980_MONTHLY
 *
 * 互換:
 * - 既存の STRIPE_PRICE_ID_{BASIC|STANDARD|PREMIUM}_{TEST|PROD} が残っていても動く
 */

type PlanCode = "basic" | "standard" | "premium";

function getAppUrl(): string {
  // 本番/Preview では NEXT_PUBLIC_APP_URL を推奨
  // 未設定でも build / smoke を落とさない（fallback）
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL ??
    "http://localhost:3000"
  );
}

function isProdEnv(): boolean {
  // Vercel本番 or NODE_ENV=production を本番扱いに寄せる
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

  // UI変更しないため、既定は standard（現行の「Pro/単一プラン」運用を壊さない）
  return "standard";
}

function getUserKeyFromBody(body: unknown): string {
  const raw =
    typeof body === "object" && body !== null
      ? safeString((body as Record<string, unknown>).userKey)
      : undefined;

  // Webhook側で「誰のCheckoutか」を紐付けるためのキー（暫定）
  // 未提供でも動く（UIを変えない）
  return raw ?? "unknown";
}

function getMonthlyEnvKey(planCode: PlanCode): string {
  return planCode === "basic"
    ? "STRIPE_PRICE_BASIC_980_MONTHLY"
    : planCode === "premium"
      ? "STRIPE_PRICE_PREMIUM_5980_MONTHLY"
      : "STRIPE_PRICE_STANDARD_2980_MONTHLY";
}

/**
 * priceId 解決ルール（迷わないための統一）
 * 1) まず正本：STRIPE_PRICE_*_MONTHLY（環境を問わず最優先）
 * 2) 無ければ互換：STRIPE_PRICE_ID_*_{PROD|TEST}（prod判定で切替）
 */
function getPriceId(planCode: PlanCode): string {
  // 1) 正本を最優先
  const monthlyKey = getMonthlyEnvKey(planCode);
  const monthly = process.env[monthlyKey];
  if (monthly && monthly.trim()) return monthly.trim();

  // 2) 互換キーへフォールバック
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
    // smoke/CI では Stripe を触らない（env が無いときは 503）
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { ok: false, error: "Stripe is not configured" },
        { status: 503 },
      );
    }

    // body は optional（UI変更しない）
    const body = await req.json().catch(() => ({}));

    const planCode = getPlanCodeFromBody(body);
    const userKey = getUserKeyFromBody(body);
    const envLabel = isProdEnv() ? "prod" : "test";

    // ✅ 遅延 import（smoke対策の要）
    const { stripe } = await import("@/lib/stripe");

    const priceId = getPriceId(planCode);
    const appUrl = getAppUrl();

    // Stripe Checkout セッションを作成（Webhookで拾うため metadata を付与）
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

      // ✅ Checkout Session に metadata（Webhookで session.completed / async_payment_succeeded 等から回収可能）
      metadata: {
        planCode,
        env: envLabel,
        userKey,
        source: "shopwriter",
      },

      // ✅ Subscription にも metadata（invoice.payment_succeeded / customer.subscription.* で確実に拾える）
      subscription_data: {
        metadata: {
          planCode,
          env: envLabel,
          userKey,
          source: "shopwriter",
        },
      },
    });

    if (!session.url) {
      throw new Error("Stripe Checkout session.url is null");
    }

    return NextResponse.json({ ok: true, url: session.url }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Checkout Error:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
