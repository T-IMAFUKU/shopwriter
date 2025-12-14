// app/billing/success/page.tsx
// Stripe Checkout 決済完了後のサクセスページ（ローカル / 本番共通）

import Link from "next/link";

export const runtime = "edge";

export default function BillingSuccessPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="max-w-md w-full space-y-6 text-center">
        <h1 className="text-2xl font-semibold">お申し込みが完了しました 🎉</h1>
        <p className="text-sm text-gray-600">
          ShopWriter Pro（テスト環境）のお申し込みが完了しました。
          <br />
          この画面はテスト用のサクセスページです。
        </p>

        <div className="rounded-xl border px-4 py-3 text-left text-sm text-gray-700 bg-gray-50">
          <p className="font-medium mb-1">次のステップ</p>
          <ul className="list-disc list-inside space-y-1">
            <li>
              Stripe ダッシュボードの
              <span className="font-mono"> サブスクリプション </span>
              でステータスが <span className="font-mono">有効</span>{" "}
              になっていることを確認してください。
            </li>
            <li>
              このあと、ShopWriter 内で「サブスク状態を参照して /writer を開放する」
              実装を行っていきます。
            </li>
          </ul>
        </div>

        <div className="space-y-2">
          <Link
            href="/writer"
            className="inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            /writer に戻る
          </Link>
          <div>
            <Link
              href="/dashboard"
              className="text-xs text-gray-500 hover:underline"
            >
              ダッシュボードへ戻る
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
