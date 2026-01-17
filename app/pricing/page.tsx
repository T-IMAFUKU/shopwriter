// app/pricing/page.tsx
// Pricing Page (契約入口 / 最小で迷子にしない導線)
// - /pricing から Stripe Checkout を起動できる（Basic / Standard / Premium）
// - 未ログイン時は押せない（ログイン案内を明示）
// - Checkout 起動は正本の /api/billing/checkout を利用（/api/stripe/checkout は廃止方向）
// - 「請求・プラン管理へ」は契約後導線として残す
// - 価格表記：税抜（※別途消費税）を維持

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Crown, Sparkles, Rocket, ShieldCheck } from "lucide-react";

type PlanCode = "BASIC_980" | "STANDARD_2980" | "PREMIUM_5980";
type BillingPlanCode = "basic" | "standard" | "premium";

type AuthSessionResponse = {
  user?: {
    email?: string | null;
  };
};

type CheckoutApiResponse = {
  ok?: boolean;
  url?: string | null;
  error?: string;
  message?: string;
  code?: string;
};

type UiMessageKind = "info" | "success" | "error";

function normalizeMessageKind(v: UiMessageKind | null | undefined): UiMessageKind {
  if (v === "success" || v === "error" || v === "info") return v;
  return "info";
}

function messageBoxClass(kind: UiMessageKind): string {
  switch (kind) {
    case "success":
      return "rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900";
    case "error":
      return "rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900";
    case "info":
    default:
      return "rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900";
  }
}

function toStringSafe(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function formatCheckoutFailureMessage(
  resStatus: number,
  api: CheckoutApiResponse,
  isProdBuild: boolean,
): { kind: UiMessageKind; text: string } {
  if (resStatus === 401) {
    return { kind: "error", text: "ログインしてからお試しください。" };
  }

  if (resStatus === 503) {
    return {
      kind: "error",
      text: "決済を開始できませんでした（Stripe の設定が未完了です）。管理者にご連絡ください。",
    };
  }

  const raw =
    toStringSafe(api.error) ||
    toStringSafe(api.message) ||
    toStringSafe(api.code) ||
    null;

  if (!isProdBuild && raw) {
    const m = raw.match(/^Missing Stripe price env:\s*(.+)$/);
    if (m?.[1]) {
      return {
        kind: "error",
        text: `決済を開始できませんでした（設定不足：${m[1]}）。.env.local / Vercel 環境変数を確認してください。`,
      };
    }
    return { kind: "error", text: `決済を開始できませんでした：${raw}` };
  }

  return {
    kind: "error",
    text: "決済を開始できませんでした。しばらくしてから再度お試しください。",
  };
}

function toBillingPlanCode(code: PlanCode): BillingPlanCode {
  switch (code) {
    case "BASIC_980":
      return "basic";
    case "PREMIUM_5980":
      return "premium";
    case "STANDARD_2980":
    default:
      return "standard";
  }
}

const PLANS: Array<{
  code: PlanCode;
  title: string;
  price: string;
  desc: string;
  icon: React.ReactNode;
  cta: string;
  highlight?: boolean;
}> = [
  {
    code: "BASIC_980",
    title: "Basic",
    price: "月額 980円（税抜）",
    desc: "まずは最小の有料プランで試したい方向け。",
    icon: <Sparkles className="h-5 w-5 text-indigo-600" />,
    cta: "Basicで始める",
  },
  {
    code: "STANDARD_2980",
    title: "Standard",
    price: "月額 2,980円（税抜）",
    desc: "迷ったらこれ。日常運用にちょうどいい標準プラン。",
    icon: <Rocket className="h-5 w-5 text-indigo-600" />,
    cta: "Standardで始める",
    highlight: true,
  },
  {
    code: "PREMIUM_5980",
    title: "Premium",
    price: "月額 5,980円（税抜）",
    desc: "より本格的に使いたい方向けの上位プラン。",
    icon: <ShieldCheck className="h-5 w-5 text-indigo-600" />,
    cta: "Premiumで始める",
  },
];

export default function PricingPage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<UiMessageKind>("info");
  const [postingPlan, setPostingPlan] = useState<PlanCode | null>(null);

  const isProdBuild = process.env.NODE_ENV === "production";

  const canStartCheckout = useMemo(
    () => isLoggedIn && postingPlan === null,
    [isLoggedIn, postingPlan],
  );

  useEffect(() => {
    let cancelled = false;

    async function fetchSession() {
      try {
        const res = await fetch("/api/auth/session", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });

        if (!res.ok) {
          if (!cancelled) setIsLoggedIn(false);
          return;
        }

        const data: AuthSessionResponse = await res.json().catch(() => ({}));
        const loggedIn = Boolean(data.user?.email);
        if (!cancelled) setIsLoggedIn(loggedIn);
      } catch {
        if (!cancelled) setIsLoggedIn(false);
      }
    }

    fetchSession();
    return () => {
      cancelled = true;
    };
  }, []);

  async function startCheckout(planCode: PlanCode) {
    if (!isLoggedIn) {
      setMessageKind("error");
      setMessage("ログインしてからお試しください。");
      return;
    }

    try {
      setPostingPlan(planCode);
      setMessage(null);

      const billingPlanCode = toBillingPlanCode(planCode);

      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planCode: billingPlanCode }),
      });

      const data: CheckoutApiResponse = await res
        .json()
        .catch(() => ({} as CheckoutApiResponse));

      const ok = Boolean(res.ok && data?.ok && typeof data?.url === "string" && data.url);

      if (!ok) {
        console.error("Checkout error:", { status: res.status, data });
        const msg = formatCheckoutFailureMessage(res.status, data, isProdBuild);
        setMessageKind(normalizeMessageKind(msg.kind));
        setMessage(msg.text);
        return;
      }

      window.location.href = String(data.url);
    } catch (err) {
      console.error(err);
      setMessageKind("error");
      setMessage("エラーが発生しました。時間をおいて再試行してください。");
    } finally {
      setPostingPlan(null);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-14 space-y-10">
      <header className="space-y-4 text-center">
        <div className="mx-auto inline-flex items-center justify-center gap-2 rounded-full border bg-white px-4 py-2 shadow-sm">
          <Crown className="h-5 w-5 text-indigo-600" />
          <span className="text-sm font-medium text-slate-900">ShopWriter</span>
        </div>

        <h1 className="text-3xl font-bold tracking-tight">プランと料金</h1>

        <p className="mx-auto max-w-2xl text-sm text-slate-600">
          まずはプランを選んで始められます。契約後の請求管理は「請求とプラン」から行えます。
        </p>

        <div className="mx-auto max-w-2xl rounded-md border bg-white px-4 py-3 text-sm text-slate-700">
          <p className="font-medium">価格表記について</p>
          <p className="mt-1 text-slate-600">
            本ページの金額は <span className="font-medium">税抜価格</span> です。
            <br />
            <span className="font-medium">※別途消費税がかかります</span>
          </p>
        </div>

        {!isLoggedIn && (
          <p className="text-sm text-slate-600">
            先にログインが必要です（決済の乱用防止のため）。
            <span className="ml-2">
              <Link href="/api/auth/signin" className="font-medium text-indigo-600 hover:underline">
                ログインする
              </Link>
            </span>
          </p>
        )}
      </header>

      {message && <div className={messageBoxClass(messageKind)}>{message}</div>}

      <section className="grid gap-4 md:grid-cols-3">
        {PLANS.map((p) => (
          <Card
            key={p.code}
            className={["relative overflow-hidden", p.highlight ? "border-indigo-200 shadow-md" : ""].join(" ")}
          >
            {p.highlight && (
              <div className="absolute right-3 top-3 rounded-full bg-indigo-600 px-3 py-1 text-xs font-medium text-white">
                おすすめ
              </div>
            )}

            <CardHeader className="space-y-2">
              <div className="flex items-center gap-2">
                {p.icon}
                <CardTitle className="text-lg">{p.title}</CardTitle>
              </div>
              <p className="text-sm font-semibold text-slate-900">{p.price}</p>
              <p className="text-sm text-slate-600">{p.desc}</p>
            </CardHeader>

            <CardContent className="space-y-3">
              <Button
                type="button"
                className="w-full"
                onClick={() => startCheckout(p.code)}
                disabled={!canStartCheckout || !isLoggedIn || postingPlan !== null}
              >
                {postingPlan === p.code ? "Checkout 起動中…" : p.cta}
              </Button>

              {!isLoggedIn && <p className="text-xs text-slate-500">ログイン後に押せます。</p>}

              <p className="text-xs text-slate-500">※決済は Stripe の Checkout 画面で行います。</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="rounded-xl border bg-white px-6 py-5 shadow-sm space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-900">請求・プラン管理</p>
          <p className="text-sm text-slate-700">
            契約後の請求情報の確認やお支払い方法の変更は、アカウント画面から行えます。
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-center">
          <Button asChild variant="outline">
            <Link href="/account/billing">請求・プラン管理へ</Link>
          </Button>
        </div>

        <p className="text-xs text-slate-500 text-center">
          ※「請求とプラン」では Stripe のカスタマーポータルへ遷移して管理できます。
        </p>
      </section>
    </main>
  );
}
