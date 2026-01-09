// app/billing/cancel/page.tsx
// Stripe Checkout Cancel Page
// - Checkout cancel_url の戻り先（/billing/cancel）を実在させ、404 を防ぐ
// - 年内リリース水準：最小・安全・導線のみ

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-static";

export default function BillingCancelPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">お支払いはキャンセルされました</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            決済は完了していません。もう一度プランを選んでやり直すことができます。
          </p>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild className="w-full sm:w-auto">
              <Link href="/pricing">プランに戻る</Link>
            </Button>

            <Button asChild variant="outline" className="w-full sm:w-auto">
              <Link href="/dashboard">ダッシュボードへ</Link>
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            ※この画面は Stripe Checkout の「戻る」操作で表示されることがあります。
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
