// app/pricing/page.tsx
// Pricing Page (Minimal Placeholder)
// - 導線破綻を防ぐための最小実装
// - 実際の契約/請求情報の確認や変更は /account/billing に集約
// - 年内リリース②（価格・税表記）：税抜表記の方針を明記

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Crown } from "lucide-react";

export const dynamic = "force-static";

export default function PricingPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <div className="flex flex-col items-center gap-6 text-center">
        <Crown className="h-10 w-10 text-indigo-600" />

        <h1 className="text-2xl font-bold tracking-tight">プランと料金</h1>

        <p className="text-muted-foreground">
          ShopWriter のご利用プランと料金についてのページです。
          <br />
          実際の契約・請求情報の確認や変更は、アカウント画面から行えます。
        </p>

        <div className="rounded-md border px-4 py-3 text-sm">
          <p className="font-medium">価格表記について</p>
          <p className="mt-1 text-muted-foreground">
            本サービスの料金は <span className="font-medium">税抜価格</span> で表記しています。
            <br />
            <span className="font-medium">※別途消費税がかかります</span>
          </p>
        </div>

        <Button asChild size="sm">
          <Link href="/account/billing">請求・プラン管理へ</Link>
        </Button>
      </div>
    </main>
  );
}
