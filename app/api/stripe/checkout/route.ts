// app/api/stripe/checkout/route.ts
// Compatibility alias route
// - UI 側（/pricing, /account/billing）が /api/stripe/checkout を叩いているため、
//   実体の /api/billing/checkout に中継して購入導線を成立させる。
// - 年内リリースの最短復旧策（UIを大きく触らない）
// - 重要: UI 由来の planCode（BASIC_980 等）を、billing 側の PlanCode（basic 等）へ正規化してから中継する

export const runtime = "nodejs";

import type { NextRequest } from "next/server";
import { POST as BillingCheckoutPOST } from "../../billing/checkout/route";

type IncomingBody = Record<string, unknown>;

function normalizePlanCode(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;

  // pricing 側（現状）
  if (raw === "BASIC_980") return "basic";
  if (raw === "STANDARD_2980") return "standard";
  if (raw === "PREMIUM_5980") return "premium";

  // 既に billing 側の形で来ている場合（将来/他UI）
  if (raw === "basic" || raw === "standard" || raw === "premium") return raw;

  return undefined;
}

export async function POST(req: NextRequest) {
  // body を読めない/壊れている場合は、そのまま中継（既存挙動維持）
  let body: IncomingBody | null = null;

  try {
    body = (await req.json()) as IncomingBody;
  } catch {
    body = null;
  }

  if (!body) {
    return BillingCheckoutPOST(req);
  }

  const normalized = normalizePlanCode(body.planCode);

  // 変換できない場合も既存挙動維持（billing側のデフォルトに委ねる）
  if (!normalized) {
    // NOTE: ここで何も変えずに中継
    const forwardReq = new Request(req.url, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify(body),
    });
    return BillingCheckoutPOST(forwardReq);
  }

  const forwardBody: IncomingBody = { ...body, planCode: normalized };

  const forwardReq = new Request(req.url, {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify(forwardBody),
  });

  return BillingCheckoutPOST(forwardReq);
}
