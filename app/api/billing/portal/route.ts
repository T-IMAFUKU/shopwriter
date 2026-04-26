// app/api/billing/portal/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PortalResponse =
  | {
      ok: true;
      url: string;
    }
  | {
      ok: false;
      error: string;
    };

function json(payload: PortalResponse, status: number) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store, must-revalidate",
    },
  });
}

function resolveReturnUrl(req: Request): string {
  const fallbackOrigin = process.env.NEXTAUTH_URL ?? new URL(req.url).origin;
  const originHeader = req.headers.get("origin");

  const origin =
    typeof originHeader === "string" && originHeader.length > 0
      ? originHeader
      : fallbackOrigin;

  return `${origin.replace(/\/$/, "")}/account/billing`;
}

async function resolveStripeCustomerIdFromSession(): Promise<
  | { ok: true; customerId: string }
  | { ok: false; status: 401 | 403; error: string }
> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;

  if (!email) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized",
    };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      stripeCustomerId: true,
    },
  });

  const customerId = user?.stripeCustomerId;

  if (!customerId) {
    return {
      ok: false,
      status: 403,
      error: "Stripe customer is not linked to this user.",
    };
  }

  return {
    ok: true,
    customerId,
  };
}

async function createPortalUrl(req: Request): Promise<PortalResponse> {
  const resolved = await resolveStripeCustomerIdFromSession();

  if (!resolved.ok) {
    return {
      ok: false,
      error: resolved.error,
    };
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: resolved.customerId,
    return_url: resolveReturnUrl(req),
  });

  return {
    ok: true,
    url: portalSession.url,
  };
}

/**
 * GET /api/billing/portal
 *
 * ログイン中ユーザーのDB上の stripeCustomerId だけを使って
 * Billing Portal URLを作成する。
 *
 * query の customerId は受け取らない。
 */
export async function GET(req: Request) {
  try {
    const resolved = await resolveStripeCustomerIdFromSession();

    if (!resolved.ok) {
      return json(
        {
          ok: false,
          error: resolved.error,
        },
        resolved.status,
      );
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: resolved.customerId,
      return_url: resolveReturnUrl(req),
    });

    return json(
      {
        ok: true,
        url: portalSession.url,
      },
      200,
    );
  } catch (e: unknown) {
    const err = e as { message?: string };

    return json(
      {
        ok: false,
        error: err.message ?? "Failed to create billing portal session.",
      },
      500,
    );
  }
}

/**
 * POST /api/billing/portal
 *
 * ログイン中ユーザーのDB上の stripeCustomerId だけを使って
 * Billing Portal URLを作成する。
 *
 * body の customerId は受け取らない。
 */
export async function POST(req: Request) {
  try {
    const payload = await createPortalUrl(req);

    if (!payload.ok) {
      const status =
        payload.error === "Unauthorized"
          ? 401
          : payload.error === "Stripe customer is not linked to this user."
            ? 403
            : 500;

      return json(payload, status);
    }

    return json(payload, 200);
  } catch (e: unknown) {
    const err = e as { message?: string };

    return json(
      {
        ok: false,
        error: err.message ?? "Failed to create billing portal session.",
      },
      500,
    );
  }
}