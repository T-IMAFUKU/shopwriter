// app/account/billing/page.tsx
// Stripe Billing UI (Phase D-7 / ステータス別UI枠組み + 価格API連携版)
// - 有料プラン一覧は /api/billing/plans から Stripe Price 情報を取得して表示
// - Billing Portal は /api/billing/portal に統一
//
// 年内リリース最終化（Stripe完了後）:
// - NextAuth session に stripeCustomerId / subscriptionStatus が載らない構成でも、Portal遷移の実動確認ができるようにする
// - 「Portalを開けるか」の判定は、クライアントではなく /api/billing/portal（サーバ）に委ねる
//   ※ session から user を特定し、サーバ側で customerId を解決する想定（または body の customerId を利用）
//
// 重要:
// - これにより UI 側の誤判定（常にFREE扱い→ボタンdisabled）を回避し、paidユーザーのPortal動作確認を可能にする
//
// 年内リリース②（価格・税表記）:
// - 価格は「税抜価格」で統一し、ページ内に注意書きを表示（※別途消費税がかかります）
// - 「有料プランのご案内」セクションは情報が薄くノイズになるため削除（/pricing へ誘導）

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

type SubscriptionStatusCode =
  | "NONE"
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED"
  | "INACTIVE";

type AuthSessionResponse = {
  user?: {
    id?: string;
    email?: string | null;
    name?: string | null;
    // NOTE: 現状の /api/auth/session には入っていない想定（入ってもOK）
    stripeCustomerId?: string | null;
    subscriptionStatus?: string | null;
    stripeSubscriptionId?: string | null;
  };
};

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

function BillingPageContent() {
  const params = useSearchParams();

  const checkoutStatus = params.get("checkout");
  const [message, setMessage] = useState<string | null>(null);
  const [isCheckoutPosting, setIsCheckoutPosting] = useState(false);
  const [isPortalOpening, setIsPortalOpening] = useState(false);

  // セッション情報（最低限：ログインしているか）
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // session に載っていれば使う（載っていないのが現状の前提）
  const [stripeCustomerId, setStripeCustomerId] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] =
    useState<SubscriptionStatusCode>("NONE");

  useEffect(() => {
    if (checkoutStatus === "success") {
      setMessage("決済が完了しました。ありがとうございます。");
    } else if (checkoutStatus === "cancel") {
      setMessage("決済をキャンセルしました。再度お試しください。");
    } else {
      setMessage(null);
    }
  }, [checkoutStatus]);

  // NextAuth session を取得（ログイン判定 + 任意でstripeCustomerId/statusも拾う）
  useEffect(() => {
    let cancelled = false;

    async function fetchSession() {
      try {
        const res = await fetch("/api/auth/session", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });

        if (!res.ok) {
          if (!cancelled) {
            setIsLoggedIn(false);
            setStripeCustomerId(null);
            setSessionStatus("NONE");
          }
          return;
        }

        const data: AuthSessionResponse = await res.json().catch(() => ({}));
        const email = data.user?.email ?? null;
        const loggedIn = Boolean(email);

        const cid = data.user?.stripeCustomerId ?? null;
        const subStatus = normalizeSubscriptionStatus(
          data.user?.subscriptionStatus,
        );

        if (!cancelled) {
          setIsLoggedIn(loggedIn);
          setStripeCustomerId(typeof cid === "string" ? cid : null);
          setSessionStatus(subStatus);
        }
      } catch {
        if (!cancelled) {
          setIsLoggedIn(false);
          setStripeCustomerId(null);
          setSessionStatus("NONE");
        }
      }
    }

    fetchSession();
    return () => {
      cancelled = true;
    };
  }, []);

  // 表示は現状「session由来」（ただし session に課金情報が載らない場合があるため過信しない）
  const subscriptionStatus: SubscriptionStatusCode = sessionStatus;
  const ui = getSubscriptionUi(subscriptionStatus);

  // ★重要：Portal を開けるかの最終判定はサーバに委ねる
  const canAttemptOpenPortal = isLoggedIn;

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

  async function openBillingPortal() {
    try {
      setIsPortalOpening(true);

      if (!isLoggedIn) {
        setMessage("ログインしてからお試しください。");
        return;
      }

      const body =
        stripeCustomerId && typeof stripeCustomerId === "string"
          ? { customerId: stripeCustomerId }
          : {};

      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

        if (res.status === 400 || res.status === 403) {
          setMessage(
            "請求情報の確認・変更は、有料プランのご契約後にご利用いただけます。",
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

  const showSessionHint = isLoggedIn && !stripeCustomerId;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">請求とプラン</h1>
        <p className="text-sm text-slate-600">
          現在のご利用プランと請求情報を確認できます。
        </p>

        <div className="rounded-md border bg-white px-4 py-3 text-xs text-slate-700">
          <p className="font-medium">価格表記について</p>
          <p className="mt-1 text-slate-600">
            本ページに表示される金額は <span className="font-medium">税抜価格</span>{" "}
            です。
            <br />
            <span className="font-medium">※別途消費税がかかります</span>
          </p>
        </div>
      </header>

      {message && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          {message}
        </div>
      )}

      <section className="space-y-6">
        <div className="rounded-xl border bg-white px-6 py-5 shadow-sm">
          {/* ✅ モバイル：縦並び（バッジを先頭=上寄せ） / sm以上：従来どおり右側 */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <span
              className={[
                "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium",
                "self-start sm:ml-auto sm:self-start sm:order-2",
                ui.badgeClass,
              ].join(" ")}
            >
              {ui.badgeText}
            </span>

            <div className="space-y-1 sm:order-1">
              <p className="text-xs font-medium text-slate-500">
                現在のご利用プラン
              </p>
              <p className="text-lg font-semibold text-slate-900">
                {ui.planLabel}
              </p>
              <p className="text-sm text-slate-700">{ui.priceText}</p>
              <p className="mt-2 text-xs text-slate-500">{ui.nextBillingText}</p>
              <p className="mt-1 text-xs text-slate-500">{ui.noteText}</p>

              {showSessionHint && (
                <p className="mt-2 text-xs text-slate-500">
                  ※現在のセッション情報では課金状態を取得できませんでした。請求情報の確認はボタンからお試しください。
                </p>
              )}
            </div>
          </div>
        </div>

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
              disabled={!canAttemptOpenPortal || isPortalOpening}
              className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPortalOpening ? "読み込み中…" : "請求情報を確認・変更する"}
            </button>

            <Link
              href="/pricing"
              className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-5 py-2 text-sm font-medium text-slate-900 shadow-sm hover:bg-slate-50"
            >
              プランを見る
            </Link>
          </div>

          {!isLoggedIn && (
            <p className="text-xs text-slate-500">
              請求情報の確認・変更を行うには、ログインが必要です。
            </p>
          )}
        </div>

        {isCheckoutPosting && (
          <p className="text-xs text-slate-500">プラン変更の処理中です…</p>
        )}
      </section>
    </div>
  );
}
