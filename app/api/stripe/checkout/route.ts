// app/api/stripe/checkout/route.ts
// Compatibility alias route (SSOT: billing)
// - UI 側（/pricing, /account/billing）が /api/stripe/checkout を叩く互換のために残す。
// - 実体は /api/billing/checkout（正本）
// - 重要: UI 由来の planCode（BASIC_980 等）を、billing 側の PlanCode（basic 等）へ正規化して中継する。
// - 恒久対策: Request body を二重に消費しない（必ず新しい Request を作って billing 側へ渡す）

export const runtime = "nodejs";

import type { NextRequest } from "next/server";
import { POST as BillingCheckoutPOST } from "../../billing/checkout/route";

type IncomingBody = Record<string, unknown>;

function normalizePlanCode(raw: unknown): "basic" | "standard" | "premium" | undefined {
  if (typeof raw !== "string") return undefined;

  // pricing 側（現状）
  if (raw === "BASIC_980") return "basic";
  if (raw === "STANDARD_2980") return "standard";
  if (raw === "PREMIUM_5980") return "premium";

  // 既に billing 側の形で来ている場合（将来/他UI）
  if (raw === "basic" || raw === "standard" || raw === "premium") return raw;

  return undefined;
}

function cloneHeadersForJson(req: Request): Headers {
  const h = new Headers(req.headers);
  // 念のため JSON を明示（fetch 側が落としてくるケース対策）
  if (!h.get("content-type")) h.set("content-type", "application/json");
  // content-length は body とズレると厄介なので削除
  h.delete("content-length");
  return h;
}

export async function POST(req: NextRequest) {
  // body は「読めても読めなくても」最終的に必ず forwardReq を作って中継する（body二重消費防止）
  let body: IncomingBody = {};

  try {
    const parsed = (await req.json()) as IncomingBody;
    if (parsed && typeof parsed === "object") body = parsed;
  } catch {
    // 空body/壊れbodyは {} 扱い（billing 側のデフォルトに委ねる）
    body = {};
  }

  const normalized = normalizePlanCode(body.planCode);

  const forwardBody: IncomingBody =
    normalized ? { ...body, planCode: normalized } : { ...body };

  // billing 側が req.json() を読む前提なので、必ず fresh Request を作る
  const forwardReq = new Request(req.url, {
    method: "POST",
    headers: cloneHeadersForJson(req),
    body: JSON.stringify(forwardBody),
  });

  return BillingCheckoutPOST(forwardReq);
}
