// app/account/billing/page.tsx
// Stripe Billing UI (Phase D-7 / ステータス別UI枠組み + 価格API連携版)
// - Webhook で同期される購読ステータスを前提にした UI
// - 有料プラン一覧は /api/billing/plans から Stripe Price 情報を取得して表示
// - Checkout / Billing Portal のロジックは保持（ただし Portal の叩き先は /api/billing/portal に統一）
//
// 年内リリース最終化（Stripe完了後）:
// - FREE（stripeCustomerId=null）で Billing Portal を押せるのはUX事故なので、UI側で無効化し /pricing へ誘導する
// - alert ではなく、ページ内の案内に統一する

"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type PlanCode =
  | "FREE"
  | "TRIALING"
  | "BASIC_980"
  | "STANDARD_2980"
  | "PREMIUM_5980";

// Prisma の enum SubscriptionStatus と対応させる想定のコード
type SubscriptionStatusCode =
  | "NONE"
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED"
  | "INACTIVE";

// /api/billing/plans のレスポンスのうち、UI で使う部分だけを型として定義
type BillingPlansApiPlan = {
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

type BillingPlansApiResponse =
  | {
      ok: true;
      data: {
        plans: BillingPlansApiPlan[];
      };
    }
  | {
      ok: false;
      error?: {
        message?: string;
      };
    };

// UI 用に整形した 1 プランぶんの情報
type BillingPlanSummary = {
  code: PlanCode;
  label: string;
  description: string;
  priceText: string;
  quotaText: string;
};

// NextAuth session（最低限）
type AuthSessionResponse = {
  user?: {
    id?: string;
    email?: string | null;
    name?: string | null;
    stripeCustomerId?: string | null;
    subscriptionStatus?: string | null;
    stripeSubscriptionId?: string | null;
  };
};

// ==========================
// ステータス → 表示テキスト変換
// ==========================
function getSubscriptionUi(status: SubscriptionStatusCode) {
  switch (status) {
    case "TRIALING":
      return {
        planLabel: "トライアルプラン（お試し中）",
        priceText: "お試し期間中です。課金開始前にいつでもキャンセルできます。",
        badgeText: "お試し中",
        badgeClass: "bg-sky-50 text-sky-700 border border-sky-100",
        nextBillingText:
          "次回請求日：Stripe 側の請求スケジュールに従います（テスト環境）",
        noteText:
          "トライアル終了後は、現在のプラン設定に応じて自動的に有料プランへ切り替わります。",
      };
    case "ACTIVE":
      return {
        planLabel: "有料プラン（テスト環境）",
        priceText:
          "有料プランをご利用中です。請求やお支払い状況は Stripe 側で管理されています。",
        badgeText: "有効（有料プラン）",
        badgeClass: "bg-emerald-50 text-emerald-700 border border-emerald-100",
        nextBillingText:
          "次回請求日：次回請求日の情報は取得できませんでした（テスト環境）",
        noteText:
          "本番環境では、ここに実際の請求サイクルと金額が表示される想定です。",
      };
    case "PAST_DUE":
      return {
        planLabel: "有料プラン（お支払い要確認）",
        priceText:
          "お支払いに問題が発生しています。お支払い方法の更新または再決済が必要です。",
        badgeText: "お支払い要確認",
        badgeClass: "bg-amber-50 text-amber-800 border border-amber-100",
        nextBillingText:
          "次回請求日：お支払い状況が解消されるまで未確定です。",
        noteText:
          "Stripe カスタマーポータルからお支払い方法を確認・更新してください。",
      };
    case "CANCELED":
      return {
        planLabel: "解約済みプラン",
        priceText:
          "現在の請求期間終了後は、自動的に無料プランへ切り替わります。",
        badgeText: "解約済み",
        badgeClass: "bg-slate-100 text-slate-600 border border-slate-200",
        nextBillingText:
          "次回請求日：現在の請求期間終了までは有料機能をご利用いただけます。",
        noteText:
          "再度有料プランをご利用いただく場合は、あらためてプランを選択してください。",
      };
    case "INACTIVE":
      return {
        planLabel: "利用停止中プラン",
        priceText:
          "現在、有料プランはご利用いただけません。必要に応じてプランを再度ご契約ください。",
        badgeText: "利用停止中",
        badgeClass: "bg-slate-100 text-slate-600 border border-slate-200",
        nextBillingText:
          "次回請求日：なし（利用停止中のため請求は発生しません）。",
        noteText:
          "一時的なエラーや設定変更によりこの状態になる場合があります。",
      };
    case "NONE":
    default:
      return {
        planLabel: "無料プラン",
        priceText:
          "現在は無料枠をご利用中です。有料プランにアップグレードすると、生成回数や機能が拡張されます。",
        badgeText: "無料プラン",
        badgeClass: "bg-slate-100 text-slate-700 border border-slate-200",
        nextBillingText:
          "次回請求日：なし（無料プランのため請求は発生しません）。",
        noteText:
          "今後、有料プランの種類や価格は検証を経て順次調整していく予定です。",
      };
  }
}

function normalizeSubscriptionStatus(value: unknown): SubscriptionStatusCode {
  if (typeof value !== "string") return "NONE";
  const v = value.toUpperCase();
  if (
    v === "NONE" ||
    v === "TRIALING" ||
    v === "ACTIVE" ||
    v === "PAST_DUE" ||
    v === "CANCELED" ||
    v === "INACTIVE"
  ) {
    return v as SubscriptionStatusCode;
  }
  return "NONE";
}

// /api/billing/plans の情報を UI 用に整形するヘルパー
function normalizePlansForUi(
  apiPlans: BillingPlansApiPlan[],
): BillingPlanSummary[] {
  return apiPlans.map((plan) => {
    const { unitAmount, currency, interval } = plan.price;

    let priceText: string;
    if (currency === "jpy") {
      const formatted = unitAmount.toLocaleString("ja-JP");
      priceText = `月額 ${formatted}円`;
    } else {
      priceText = `${interval} ${unitAmount} ${currency}`;
    }

    const quotaParts: string[] = [];
    if (plan.limits.monthly != null) {
      quotaParts.push(`月${plan.limits.monthly}回`);
    }
    if (plan.limits.hourly != null) {
      quotaParts.push(`1hあたり${plan.limits.hourly}回まで`);
    }
    const quotaText =
      quotaParts.length > 0 ? quotaParts.join(" ＋ ") : "制限なし（無制限）";

    return {
      code: plan.code,
      label: plan.label,
      description: plan.description,
      priceText,
      quotaText,
    };
  });
}

// ==========================
// Suspense ラッパー
// ==========================
export default function BillingPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-3xl px-6 py-12">
          <p className="text-sm text-slate-600">請求情報を読み込み中です…</p>
        </div>
      }
    >
      <BillingPageContent />
    </Suspense>
  );
}

// ==========================
// 実際の中身コンポーネント
// ==========================
function BillingPageContent() {
  const params = useSearchParams();

  const checkoutStatus = params.get("checkout");
  const [message, setMessage] = useState<string | null>(null);
  const [isCheckoutPosting, setIsCheckoutPosting] = useState(false);
  const [isPortalOpening, setIsPortalOpening] = useState(false);

  // /api/billing/plans から取得したプラン一覧
  const [planSummaries, setPlanSummaries] = useState<BillingPlanSummary[] | null>(
    null,
  );
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState<string | null>(null);

  // セッション由来（stripeCustomerId が取れれば Portal が開ける）
  const [stripeCustomerId, setStripeCustomerId] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] =
    useState<SubscriptionStatusCode>("NONE");
  const [sessionStripeSubscriptionId, setSessionStripeSubscriptionId] =
    useState<string | null>(null);

  // checkout=success|cancel フラッシュメッセージ
  useEffect(() => {
    if (checkoutStatus === "success") {
      setMessage("決済が完了しました。ありがとうございます。");
    } else if (checkoutStatus === "cancel") {
      setMessage("決済をキャンセルしました。再度お試しください。");
    } else {
      setMessage(null);
    }
  }, [checkoutStatus]);

  // NextAuth session を取得（Portal の customerId を得る）
  useEffect(() => {
    let cancelled = false;

    async function fetchSession() {
      try {
        const res = await fetch("/api/auth/session", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });

        if (!res.ok) return;

        const data: AuthSessionResponse = await res.json().catch(() => ({}));
        const cid = data.user?.stripeCustomerId ?? null;
        const subStatus = normalizeSubscriptionStatus(
          data.user?.subscriptionStatus,
        );
        const subId = data.user?.stripeSubscriptionId ?? null;

        if (!cancelled) {
          setStripeCustomerId(typeof cid === "string" ? cid : null);
          setSessionStatus(subStatus);
          setSessionStripeSubscriptionId(typeof subId === "string" ? subId : null);
        }
      } catch {
        // 取れなくても UI は継続（Portal 押下時は無効化される）
      }
    }

    fetchSession();
    return () => {
      cancelled = true;
    };
  }, []);

  // 有料プラン一覧を API から取得
  useEffect(() => {
    let cancelled = false;

    async function fetchPlans() {
      try {
        setPlansLoading(true);
        setPlansError(null);

        const res = await fetch("/api/billing/plans", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });

        const data: BillingPlansApiResponse = await res.json();

        if (!res.ok || !data.ok) {
          const msg =
            (!data.ok && data.error?.message) ||
            "プラン情報を取得できませんでした。時間をおいて再度お試しください。";
          if (!cancelled) {
            setPlansError(msg);
            setPlanSummaries(null);
          }
          return;
        }

        const summaries = normalizePlansForUi(data.data.plans);
        if (!cancelled) {
          setPlanSummaries(summaries);
          setPlansError(null);
        }
      } catch (err) {
        console.error("Failed to fetch /api/billing/plans:", err);
        if (!cancelled) {
          setPlansError(
            "プラン情報を取得できませんでした。時間をおいて再度お試しください。",
          );
          setPlanSummaries(null);
        }
      } finally {
        if (!cancelled) {
          setPlansLoading(false);
        }
      }
    }

    fetchPlans();

    return () => {
      cancelled = true;
    };
  }, []);

  // --- 表示は「現時点では session 由来」 ---
  const subscriptionStatus: SubscriptionStatusCode = sessionStatus ?? "ACTIVE";
  const stripeSubscriptionId =
    sessionStripeSubscriptionId ?? "sub_xxxxxxxxxxxxxxxxxxxxx";
  const ui = getSubscriptionUi(subscriptionStatus);

  const canOpenPortal = Boolean(stripeCustomerId);

  // Checkout API 呼び出し（保持）
  async function startCheckout(planCode: PlanCode) {
    try {
      setIsCheckoutPosting(true);

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planCode }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok || !data.url) {
        console.error("Checkout error:", data);
        setMessage(
          "決済を開始できませんでした。しばらくしてから再度お試しください。",
        );
        return;
      }

      window.location.href = data.url;
    } catch (err) {
      console.error(err);
      setMessage("エラーが発生しました。時間をおいて再試行してください。");
    } finally {
      setIsCheckoutPosting(false);
    }
  }

  // Billing Portal API 呼び出し
  async function openBillingPortal() {
    try {
      setIsPortalOpening(true);

      // UI上は disabled だが、念のためガード
      if (!stripeCustomerId) {
        setMessage(
          "請求情報の確認・変更は、有料プランのご契約後にご利用いただけます。",
        );
        return;
      }

      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: stripeCustomerId }),
      });

      const data = await res.json().catch(() => ({} as any));

      if (!res.ok || !data.ok || !data.url) {
        console.error("Billing Portal error:", {
          status: res.status,
          data,
        });

        if (res.status === 401) {
          setMessage("ログインしてからお試しください。");
          return;
        }

        if (res.status === 400) {
          setMessage(
            "請求情報を開くための情報が不足しています（customerId 未連携など）。購読同期後に再度お試しください。",
          );
          return;
        }

        setMessage(
          "請求情報のページを開けませんでした。時間をおいて再度お試しください。",
        );
        return;
      }

      window.location.href = data.url;
    } catch (err) {
      console.error(err);
      setMessage("エラーが発生しました。時間をおいて再試行してください。");
    } finally {
      setIsPortalOpening(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 space-y-8">
      {/* ページタイトル */}
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">請求とプラン</h1>
        <p className="text-sm text-slate-600">
          現在のご利用プランと請求情報を確認できます。
        </p>
      </header>

      {/* フラッシュメッセージ */}
      {message && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          {message}
        </div>
      )}

      <section className="space-y-6">
        {/* 現在のご利用プラン（ステータス別表示） */}
        <div className="rounded-xl border bg-white px-6 py-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs font-medium text-slate-500">
                現在のご利用プラン
              </p>
              <p className="text-lg font-semibold text-slate-900">
                {ui.planLabel}
              </p>
              <p className="text-sm text-slate-700">{ui.priceText}</p>
              <p className="mt-2 text-xs text-slate-500">{ui.nextBillingText}</p>
              <p className="mt-1 text-xs text-slate-500">{ui.noteText}</p>

              {!canOpenPortal && (
                <p className="mt-2 text-xs text-slate-500">
                  Stripe の顧客情報がまだ連携されていません（購読開始後に連携されます）。
                </p>
              )}
            </div>

            <span
              className={[
                "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium",
                ui.badgeClass,
              ].join(" ")}
            >
              {ui.badgeText}
            </span>
          </div>
        </div>

        {/* 請求情報・支払い管理（Billing Portal） */}
        <div className="space-y-3 rounded-xl border bg-white px-6 py-5 shadow-sm">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-900">
              請求情報・支払い管理
            </p>
            <p className="text-sm text-slate-700">
              支払い方法の変更や請求履歴の確認は、Stripe のカスタマーポータルから行えます。
            </p>
            <p className="text-xs text-slate-500">
              ※請求書の履歴や領収書のダウンロードは、カスタマーポータル上で提供予定です。
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              onClick={openBillingPortal}
              disabled={!canOpenPortal || isPortalOpening}
              className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPortalOpening ? "読み込み中…" : "請求情報を確認・変更する"}
            </button>

            {!canOpenPortal && (
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-5 py-2 text-sm font-medium text-slate-900 shadow-sm hover:bg-slate-50"
              >
                プランを見る
              </Link>
            )}
          </div>

          {!canOpenPortal && (
            <p className="text-xs text-slate-500">
              有料プランのご契約後に、請求情報の確認・変更をご利用いただけます。
            </p>
          )}
        </div>

        {/* 有料プランのご案内（Stripe Price 連動） */}
        <div className="space-y-2 rounded-xl border border-dashed bg-slate-50 px-6 py-5">
          <p className="text-sm font-semibold text-slate-900">有料プランのご案内</p>
          <p className="text-sm text-slate-700">
            ShopWriter をより快適にご利用いただくため、複数の有料プランをご用意しています。
            金額は Stripe の Price 情報と同期されています。
          </p>

          {plansLoading && (
            <p className="mt-2 text-xs text-slate-500">
              プラン情報を読み込み中です…
            </p>
          )}

          {!plansLoading && plansError && (
            <p className="mt-2 text-xs text-red-600">{plansError}</p>
          )}

          {!plansLoading && !plansError && planSummaries && (
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              {planSummaries.map((plan) => (
                <li key={plan.code}>
                  ・{plan.label}（{plan.priceText}）：{plan.quotaText}
                </li>
              ))}
            </ul>
          )}

          <p className="mt-2 text-xs text-slate-500">
            ※本ページでは、まず UI と情報の整備を行っています。実際のプラン申し込みフローは後続フェーズで実装予定です。
          </p>

          {isCheckoutPosting && (
            <p className="mt-2 text-xs text-slate-500">
              プラン変更の処理中です…
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
