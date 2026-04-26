// app/api/webhooks/stripe/route.ts
//
// This route is intentionally closed.
//
// The active Stripe webhook endpoint for ShopWriter is:
//   /api/stripe/webhook
//
// Stripe Dashboard is configured to use /api/stripe/webhook.
// This legacy/unused route must not process webhook events because keeping
// two webhook handlers in production can cause split behavior or accidental
// duplicate subscription updates.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function notFound(): Response {
  return new Response(null, {
    status: 404,
    headers: {
      "Cache-Control": "no-store, must-revalidate",
    },
  });
}

export async function GET() {
  return notFound();
}

export async function POST() {
  return notFound();
}

export async function OPTIONS() {
  return notFound();
}