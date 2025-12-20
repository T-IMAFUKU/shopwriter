// app/api/billing/portal/route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

/**
 * 顧客ポータル（Stripe Billing Portal）に遷移するためのセッションを作成する API。
 *
 * 方針（年内リリース最終化）:
 * - customerId が明示されていればそれを使う（従来互換）
 * - 無ければ「ログイン中ユーザー（NextAuth session）→ email → DB → stripeCustomerId」で解決する
 * - FREE（stripeCustomerId=null）なら 403 で明確に弾く（UIは /pricing 誘導）
 *
 * smoke / CI では Stripe を触らない（ENV 未設定のため）
 * → Stripe系ENVが無ければ「戻る/スキップ」で返す
 */
export const runtime = "nodejs";

const prisma = new PrismaClient();

const PROD_BASE_URL = "https://shopwriter-next.vercel.app";

function getBaseUrl(req?: Request): string {
  // 1) 明示ENV
  const envBase =
    process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "";
  if (envBase) return envBase;

  // 2) リクエスト由来（localhost / preview / prod でも動く）
  if (req) {
    const h = new Headers(req.headers);
    const proto = h.get("x-forwarded-proto") || "http";
    const host = h.get("x-forwarded-host") || h.get("host");
    if (host) return `${proto}://${host}`;
  }

  // 3) 最後の砦（本番）
  return PROD_BASE_URL;
}

function getReturnUrl(req?: Request): string {
  // 入口は /account/billing に戻す（return専用ページに依存しない）
  const base = getBaseUrl(req);
  return `${base}/account/billing?portal=return`;
}

async function createPortalUrl(customerId: string, req?: Request): Promise<string> {
  // 実行時のみ Stripe を import（CI/smoke対策）
  const { stripe } = await import("@/lib/stripe");

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: getReturnUrl(req),
  });

  if (!session.url) {
    throw new Error("Stripe billing portal session.url is empty");
  }

  return session.url;
}

type SessionUser = {
  user?: {
    email?: string | null;
  };
};

async function fetchSessionEmail(req: Request): Promise<string | null> {
  // NextAuth の session を「内部API経由」で取得する（authOptions import に依存しない）
  const base = getBaseUrl(req);
  const cookie = req.headers.get("cookie") || "";

  try {
    const res = await fetch(`${base}/api/auth/session`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        cookie,
      },
      // Route Handler 内なので cache は無効寄りでOK
      cache: "no-store",
    });

    if (!res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as SessionUser;
    const email = data.user?.email ?? null;
    return typeof email === "string" && email.length > 0 ? email : null;
  } catch {
    return null;
  }
}

async function resolveCustomerIdFromDbBySession(req: Request): Promise<string | null> {
  const email = await fetchSessionEmail(req);
  if (!email) return null;

  const u = await prisma.user.findUnique({
    where: { email },
    select: { stripeCustomerId: true },
  });

  const cid = u?.stripeCustomerId ?? null;
  return typeof cid === "string" && cid.length > 0 ? cid : null;
}

/**
 * GET /api/billing/portal?customerId=xxx
 * - 画面遷移や <a href> で呼ばれても動く
 * - customerId が無ければ session→DB で補完する
 * - 成功時: Stripeポータルへ 303 redirect
 */
export async function GET(req: Request) {
  try {
    // smoke / CI ガード
    if (!process.env.STRIPE_SECRET_KEY) {
      const url = new URL(getReturnUrl(req));
      url.searchParams.set("portal", "skipped");
      return NextResponse.redirect(url, { status: 303 });
    }

    const url = new URL(req.url);
    const queryCustomerId = url.searchParams.get("customerId");

    const customerId =
      (queryCustomerId && queryCustomerId.length > 0
        ? queryCustomerId
        : await resolveCustomerIdFromDbBySession(req)) ?? null;

    if (!customerId) {
      // ログインしていない or FREE（未連携）どちらもここに落ちるので、GETは戻す
      const back = new URL(getReturnUrl(req));
      back.searchParams.set("portal", "missing_customer");
      return NextResponse.redirect(back, { status: 303 });
    }

    const portalUrl = await createPortalUrl(customerId, req);
    return NextResponse.redirect(portalUrl, { status: 303 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Portal GET Error:", message);

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}

/**
 * POST
 * - body: { customerId?: string }
 * - customerId が無ければ session→DB で補完する
 * - 成功時: { ok:true, url }
 */
export async function POST(req: Request) {
  try {
    // smoke / CI ガード（Stripe系ENVが無ければ即OKで返す）
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { ok: true, skipped: true, reason: "Stripe disabled in smoke/CI" },
        { status: 200 },
      );
    }

    const body = await req.json().catch(() => ({} as any));
    const bodyCustomerId =
      typeof body?.customerId === "string" && body.customerId.length > 0
        ? body.customerId
        : null;

    const customerId =
      bodyCustomerId ?? (await resolveCustomerIdFromDbBySession(req));

    if (!customerId) {
      // ログインしていない
      const email = await fetchSessionEmail(req);
      if (!email) {
        return NextResponse.json(
          { ok: false, error: "Unauthorized" },
          { status: 401 },
        );
      }

      // ログインはしているが customer 未連携（FREE）
      return NextResponse.json(
        { ok: false, error: "Missing customerId (not linked yet)" },
        { status: 403 },
      );
    }

    const portalUrl = await createPortalUrl(customerId, req);

    return NextResponse.json(
      { ok: true, url: portalUrl },
      { status: 200 },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Portal POST Error:", message);

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
