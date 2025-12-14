// app/api/billing/plans/route.ts
// Billing Plans API (minimal stub)
// - /account/billing が参照する /api/billing/plans を提供する
// - まずは UI 復旧のためのスタブ（Stripe 連動は後続で差し替え）

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PlanCode =
  | "FREE"
  | "TRIALING"
  | "BASIC_980"
  | "STANDARD_2980"
  | "PREMIUM_5980";

type ApiPlan = {
  code: PlanCode;
  label: string;
  description: string;
  price: {
    id: string;
    unitAmount: number;
    currency: string;
    interval: string;
  };
  limits: {
    monthly: number | null;
    hourly: number | null;
  };
};

export async function GET() {
  const plans: ApiPlan[] = [
    {
      code: "FREE",
      label: "無料プラン",
      description: "まずはお試し。最小の無料枠で体験できます。",
      price: { id: "price_free", unitAmount: 0, currency: "jpy", interval: "month" },
      limits: { monthly: null, hourly: null },
    },
    {
      code: "TRIALING",
      label: "トライアル",
      description: "お試し期間（BASIC 相当）。",
      price: { id: "price_trial", unitAmount: 980, currency: "jpy", interval: "month" },
      limits: { monthly: 100, hourly: 10 },
    },
    {
      code: "BASIC_980",
      label: "BASIC",
      description: "個人・小規模向け。まずはここから。",
      price: { id: "price_basic_980_stub", unitAmount: 980, currency: "jpy", interval: "month" },
      limits: { monthly: 100, hourly: 10 },
    },
    {
      code: "STANDARD_2980",
      label: "STANDARD",
      description: "運用量が増えた方向け。より快適に。",
      price: { id: "price_standard_2980_stub", unitAmount: 2980, currency: "jpy", interval: "month" },
      limits: { monthly: null, hourly: 30 },
    },
    {
      code: "PREMIUM_5980",
      label: "PREMIUM",
      description: "ヘビー運用向け。上限を気にせず使えます。",
      price: { id: "price_premium_5980_stub", unitAmount: 5980, currency: "jpy", interval: "month" },
      limits: { monthly: null, hourly: null },
    },
  ];

  return NextResponse.json(
    { ok: true, data: { plans } },
    { headers: { "Cache-Control": "no-store" } },
  );
}
