// app/api/stripe/checkout/route.ts
// Compatibility alias route
// - UI 側（/account/billing）が /api/stripe/checkout を叩いているため、
//   実体の /api/billing/checkout に中継して購入導線を成立させる。
// - 年内リリースの最短復旧策（UIを大きく触らない）

export const runtime = "nodejs";

import type { NextRequest } from "next/server";
import { POST as BillingCheckoutPOST } from "../../billing/checkout/route";

export async function POST(req: NextRequest) {
  return BillingCheckoutPOST(req);
}
