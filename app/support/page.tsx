// app/support/page.tsx
// サポート・お問い合わせ（Stripe審査対応・公開ページ）
// - 未ログインでも閲覧可能
// - 支払い / 返金 / Stripe決済に関する明示あり

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "サポート・お問い合わせ｜ShopWriter",
  description:
    "ShopWriterに関するサポート・お問い合わせページです。ご利用方法、契約内容、Stripe決済、請求・返金についてご案内します。",
  robots: {
    index: true,
    follow: true,
  },
};

export default function SupportPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-6 text-3xl font-bold">サポート・お問い合わせ</h1>

      <p className="mb-6 text-muted-foreground">
        本ページは、イノビスタ株式会社が提供する
        AIライティング支援サービス「ShopWriter」に関する
        サポート窓口です。
      </p>

      <p className="mb-10 text-muted-foreground">
        サービスのご利用方法、ご契約内容、Stripeを利用したお支払い、
        請求内容の確認、返金・キャンセルに関するご質問などについては、
        以下の連絡先までお問い合わせください。
      </p>

      {/* お問い合わせ先 */}
      <section className="mb-10">
        <h2 className="mb-3 text-xl font-semibold">お問い合わせ先</h2>
        <p>
          メールアドレス：
          <a
            href="mailto:innovista.grp@gmail.com"
            className="ml-1 text-blue-600 underline"
          >
            innovista.grp@gmail.com
          </a>
        </p>
      </section>

      {/* 対応時間 */}
      <section className="mb-10">
        <h2 className="mb-3 text-xl font-semibold">対応時間</h2>
        <p className="text-muted-foreground">
          原則として、3営業日以内にご返信いたします。
          <br />
          （土日祝日・年末年始を除く）
        </p>
      </section>

      {/* 対応内容 */}
      <section className="mb-10">
        <h2 className="mb-3 text-xl font-semibold">対応内容</h2>
        <ul className="list-inside list-disc text-muted-foreground">
          <li>サービスの利用方法に関するお問い合わせ</li>
          <li>不具合やエラーのご報告</li>
          <li>ご契約内容、請求、支払いに関するご質問</li>
          <li>Stripe決済に関するお問い合わせ</li>
        </ul>
      </section>

      {/* 支払い・請求 */}
      <section className="mb-10">
        <h2 className="mb-3 text-xl font-semibold">お支払い・請求について</h2>
        <p className="text-muted-foreground">
          本サービスは、Stripeを利用した
          月額サブスクリプション形式で提供しています。
        </p>
        <ul className="mt-3 list-inside list-disc text-muted-foreground">
          <li>課金はお申し込み時に開始されます</li>
          <li>以降は毎月自動更新となります</li>
          <li>
            解約はいつでも可能で、解約後は次回請求日以降の課金は行われません
          </li>
        </ul>
      </section>

      {/* 返金・キャンセル */}
      <section className="mb-10">
        <h2 className="mb-3 text-xl font-semibold">返金・キャンセルについて</h2>
        <p className="text-muted-foreground">
          本サービスはデジタルコンテンツを提供する性質上、
          原則としてお支払い後の返金はお受けしておりません。
        </p>
        <p className="mt-3 text-muted-foreground">
          ただし、以下の場合には個別に対応いたします。
        </p>
        <ul className="mt-2 list-inside list-disc text-muted-foreground">
          <li>二重課金が発生した場合</li>
          <li>
            当社起因の不具合により、サービスが正常に提供できなかった場合
          </li>
        </ul>
      </section>

      {/* 関連ポリシー */}
      <section>
        <h2 className="mb-3 text-xl font-semibold">関連ポリシー</h2>
        <ul className="space-y-2">
          <li>
            <Link href="/terms" className="text-blue-600 underline">
              利用規約
            </Link>
          </li>
          <li>
            <Link href="/privacy" className="text-blue-600 underline">
              プライバシーポリシー
            </Link>
          </li>
          <li>
            <Link
              href="/legal/tokushoho"
              className="text-blue-600 underline"
            >
              特定商取引法に基づく表記
            </Link>
          </li>
        </ul>
      </section>
    </main>
  );
}
