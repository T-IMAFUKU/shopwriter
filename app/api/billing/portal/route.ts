// app/api/billing/portal/route.ts
import { NextResponse } from "next/server";

/**
 * 顧客ポータル（Stripe Billing Portal）に遷移するためのセッションを作成する API。
 *
 * 現状の 405 は「GETで叩かれている/ページ遷移で開かれている」可能性が高い。
 * → GET でも customerId をクエリで受けて Portal URL へ redirect できるようにする。
 *
 * smoke / CI では Stripe を触らない（ENV 未設定のため）
 * → Stripe系ENVが無ければ即OK/リダイレクトで返す
 */
export const runtime = "nodejs";

const PROD_BASE_URL = "https://shopwriter-next.vercel.app";

function getBaseUrl(): string {
  // 本番は NEXTAUTH_URL が最優先。無ければ NEXT_PUBLIC_APP_URL。最後に固定の本番URL。
  return (
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    PROD_BASE_URL
  );
}

function getReturnUrl(): string {
  // 入口は /account/billing に戻す（return専用ページに依存しない）
  const base = getBaseUrl();
  return `${base}/account/billing?portal=return`;
}

async function createPortalUrl(customerId: string): Promise<string> {
  // 実行時のみ Stripe を import（CI/smoke対策）
  const { stripe } = await import("@/lib/stripe");

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: getReturnUrl(),
  });

  if (!session.url) {
    throw new Error("Stripe billing portal session.url is empty");
  }

  return session.url;
}

/**
 * GET /api/billing/portal?customerId=xxx
 * - 画面遷移や <a href> で呼ばれても動くようにする
 * - 成功時: Stripeポータルへ 303 redirect
 */
export async function GET(req: Request) {
  try {
    // smoke / CI ガード
    if (!process.env.STRIPE_SECRET_KEY) {
      // 入口復活のため「戻る」redirectにする（404/500にしない）
      const url = new URL(getReturnUrl());
      url.searchParams.set("portal", "skipped");
      return NextResponse.redirect(url, { status: 303 });
    }

    const url = new URL(req.url);
    const customerId = url.searchParams.get("customerId");

    if (!customerId) {
      return NextResponse.json(
        { ok: false, error: "Missing customerId" },
        { status: 400 },
      );
    }

    const portalUrl = await createPortalUrl(customerId);
    return NextResponse.redirect(portalUrl, { status: 303 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Portal GET Error:", message);

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 },
    );
  }
}

/**
 * POST { customerId }
 * - fetch で呼ぶ従来方式も維持
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

    const { customerId } = await req.json().catch(() => ({}));

    if (!customerId) {
      return NextResponse.json(
        { ok: false, error: "Missing customerId" },
        { status: 400 },
      );
    }

    const portalUrl = await createPortalUrl(customerId);

    return NextResponse.json(
      {
        ok: true,
        url: portalUrl,
      },
      { status: 200 },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Portal POST Error:", message);

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 },
    );
  }
}
