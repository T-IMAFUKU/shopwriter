// app/pricing/page.tsx
// Pricing Page (Minimal Placeholder)
// - 導線破綻を防ぐための最小実装
// - 実際の契約/請求情報の確認や変更は /account/billing に集約

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

        <Button asChild size="sm">
          <Link href="/account/billing">請求・プラン管理へ</Link>
        </Button>
      </div>
    </main>
  );
}
