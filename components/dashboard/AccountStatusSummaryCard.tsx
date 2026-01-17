// components/dashboard/AccountStatusSummaryCard.tsx
// 入口整備フェーズ⑥（UI Polishing）
// AccountStatusSummaryCard（実データ接続 / ログイン済み前提）
//
// 合意（2026-01-17）:
// - 主目的: 契約状態
// - SSOT: DB（Prisma User.subscriptionStatus）
// - 取得責務: カード内（案2）
// - 表示: A（7ラベル枠）だが、現状は案Aとして DB enum 5種で運用
// - ダッシュボードはログイン必須のため「未ログイン分岐」は持たない
//
// 表示仕様（合意：案2）:
// - CANCELED は「解約済み」をラベルに出さず、「無料」ラベル＋説明文で解約を伝える
//   ねらい：ユーザーの混乱（無料？解約？）を防ぐ

import * as React from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { SubscriptionStatus } from "@prisma/client";

export type AccountStatusSummaryCardProps = {
  // 既存呼び出し互換のため残す（dashboard/page.tsx から固定値が渡っている）
  // ただし「実データ表示」が目的のため、DB取得成功時は DB を優先する
  statusLabel?: string; // 例: "有効" / "支払い遅延" など
  hint?: string; // 例: "請求情報を確認してください"
  primaryActionHref?: string; // 例: "/account/billing"
  primaryActionLabel?: string; // 例: "請求情報へ"
};

type ViewModel = {
  label: string;
  hint: string;
  subline: string;
  actionHref?: string;
  actionLabel?: string;
};

function mapSubscriptionToView(status: SubscriptionStatus): ViewModel {
  switch (status) {
    case SubscriptionStatus.ACTIVE:
      return {
        label: "有効",
        hint: "プランは有効です。",
        subline: "現在の状態を表示しています。",
        actionHref: "/account/billing",
        actionLabel: "請求・プラン管理へ",
      };
    case SubscriptionStatus.TRIALING:
      return {
        label: "トライアル中",
        hint: "トライアル期間中です。",
        subline: "現在の状態を表示しています。",
        actionHref: "/account/billing",
        actionLabel: "請求・プラン管理へ",
      };
    case SubscriptionStatus.PAST_DUE:
      return {
        label: "お支払い要確認",
        hint: "お支払いの確認が必要です。請求情報をご確認ください。",
        subline: "現在の状態を表示しています。",
        actionHref: "/account/billing",
        actionLabel: "請求情報を確認",
      };
    case SubscriptionStatus.CANCELED:
      // 表示仕様（案2）: ラベルは「無料」、説明文で解約済みを伝える
      return {
        label: "無料",
        hint: "以前の契約は解約されています。再開できます。",
        subline: "現在の状態を表示しています。",
        actionHref: "/account/billing",
        actionLabel: "再開する",
      };
    case SubscriptionStatus.INACTIVE:
    default:
      return {
        label: "無料",
        hint: "有料プランは未契約です。",
        subline: "現在の状態を表示しています。",
        actionHref: "/account/billing",
        actionLabel: "プランを見る",
      };
  }
}

function buildFallbackFromProps(props: AccountStatusSummaryCardProps): ViewModel {
  const label = props.statusLabel ?? "未取得";
  const hint = props.hint ?? "アカウント状態を確認できます。";
  return {
    label,
    hint,
    subline: props.statusLabel ? "現在の状態を表示しています。" : "準備中です。",
    actionHref: props.primaryActionHref,
    actionLabel: props.primaryActionLabel,
  };
}

function buildErrorFallback(props: AccountStatusSummaryCardProps): ViewModel {
  const fb = buildFallbackFromProps(props);
  return {
    ...fb,
    hint: "アカウント状態を取得できませんでした。再読み込みしてください。",
    subline: "一時的なエラーの可能性があります。",
  };
}

export async function AccountStatusSummaryCard(props: AccountStatusSummaryCardProps) {
  // ダッシュボードはログイン必須の前提。
  // ただしセッションに email が無い等の異常系はあり得るので、安全にフォールバックする。
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? null;

  if (!email) {
    const vm = buildErrorFallback(props);
    return (
      <Card className="p-0">
        <CardHeader className="p-5 md:p-6 pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base">アカウント状態</CardTitle>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{vm.hint}</p>
        </CardHeader>

        <CardContent className="p-5 md:p-6 pt-0">
          <div className="rounded-md border bg-muted/20 p-4">
            <div className="text-sm font-medium">{vm.label}</div>
            <div className="mt-1 text-xs text-muted-foreground">{vm.subline}</div>
          </div>

          {vm.actionHref && vm.actionLabel ? (
            <div className="mt-3">
              <Button asChild variant="secondary" className="justify-start">
                <Link href={vm.actionHref} aria-label={vm.actionLabel}>
                  {vm.actionLabel}
                </Link>
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { subscriptionStatus: true },
    });

    const status = user?.subscriptionStatus ?? SubscriptionStatus.INACTIVE;
    const vm = mapSubscriptionToView(status);

    return (
      <Card className="p-0">
        <CardHeader className="p-5 md:p-6 pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base">アカウント状態</CardTitle>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{vm.hint}</p>
        </CardHeader>

        <CardContent className="p-5 md:p-6 pt-0">
          <div className="rounded-md border bg-muted/20 p-4">
            <div className="text-sm font-medium">{vm.label}</div>
            <div className="mt-1 text-xs text-muted-foreground">{vm.subline}</div>
          </div>

          {vm.actionHref && vm.actionLabel ? (
            <div className="mt-3">
              <Button asChild variant="secondary" className="justify-start">
                <Link href={vm.actionHref} aria-label={vm.actionLabel}>
                  {vm.actionLabel}
                </Link>
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    );
  } catch {
    const vm = buildErrorFallback(props);
    return (
      <Card className="p-0">
        <CardHeader className="p-5 md:p-6 pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base">アカウント状態</CardTitle>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{vm.hint}</p>
        </CardHeader>

        <CardContent className="p-5 md:p-6 pt-0">
          <div className="rounded-md border bg-muted/20 p-4">
            <div className="text-sm font-medium">{vm.label}</div>
            <div className="mt-1 text-xs text-muted-foreground">{vm.subline}</div>
          </div>

          {vm.actionHref && vm.actionLabel ? (
            <div className="mt-3">
              <Button asChild variant="secondary" className="justify-start">
                <Link href={vm.actionHref} aria-label={vm.actionLabel}>
                  {vm.actionLabel}
                </Link>
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    );
  }
}
