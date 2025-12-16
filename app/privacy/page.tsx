// app/privacy/page.tsx
// プライバシーポリシー（ShopWriter 用 / Stripe審査対応版）

export const runtime = "nodejs";

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-left text-gray-900">
      <h1 className="mb-8 text-3xl font-bold">プライバシーポリシー</h1>

      <section className="space-y-6">
        <p>
          イノビスタ株式会社（以下、「当社」といいます。）は、当社が提供する
          AIライティング支援サービス「ShopWriter」（以下、「本サービス」といいます。）
          において、ユーザーの個人情報を以下の方針に基づき適切に取り扱います。
        </p>

        <div>
          <h2 className="font-semibold">1. 取得する情報</h2>
          <p>
            当社は、本サービスの提供にあたり、以下の情報を取得する場合があります。
          </p>
          <ul className="list-disc pl-6">
            <li>メールアドレス</li>
            <li>アカウント識別子（認証サービス提供元から付与されるID）</li>
            <li>決済に関する情報（Stripeを通じて処理され、当社がカード情報を直接保持することはありません）</li>
            <li>お問い合わせ内容</li>
            <li>サービス利用状況（アクセス履歴、操作ログ等）</li>
          </ul>
        </div>

        <div>
          <h2 className="font-semibold">2. 利用目的</h2>
          <p>
            取得した情報は、以下の目的の範囲内で利用します。
          </p>
          <ul className="list-disc pl-6">
            <li>本サービスの提供および運営</li>
            <li>ユーザー認証およびアカウント管理</li>
            <li>料金請求、支払い処理、利用状況の確認</li>
            <li>お問い合わせへの対応</li>
            <li>サービス品質の向上および不正利用防止</li>
          </ul>
        </div>

        <div>
          <h2 className="font-semibold">3. 決済情報の取り扱い</h2>
          <p>
            本サービスの決済には、第三者決済サービスである Stripe を利用しています。
            クレジットカード情報は Stripe により直接処理され、当社が保持・閲覧することはありません。
          </p>
        </div>

        <div>
          <h2 className="font-semibold">4. 第三者提供</h2>
          <p>
            当社は、法令に基づく場合を除き、ユーザーの個人情報を本人の同意なく第三者に提供することはありません。
          </p>
        </div>

        <div>
          <h2 className="font-semibold">5. 個人情報の管理</h2>
          <p>
            当社は、個人情報の漏えい、滅失または毀損を防止するため、
            適切な安全管理措置を講じます。
          </p>
        </div>

        <div>
          <h2 className="font-semibold">6. 開示・訂正・削除</h2>
          <p>
            ユーザーは、当社が保有する自己の個人情報について、
            開示・訂正・削除を求めることができます。
            ご希望の場合は、下記お問い合わせ先までご連絡ください。
          </p>
        </div>

        <div>
          <h2 className="font-semibold">7. プライバシーポリシーの変更</h2>
          <p>
            本ポリシーの内容は、法令の変更やサービス内容の改善に応じて、
            予告なく変更される場合があります。
          </p>
        </div>

        <div>
          <h2 className="font-semibold">8. お問い合わせ先</h2>
          <p>
            本ポリシーに関するお問い合わせは、以下までご連絡ください。
          </p>
          <p className="mt-2">
            イノビスタ株式会社<br />
            メールアドレス：
            <a
              href="mailto:innovista.grp@gmail.com"
              className="text-blue-600 underline"
            >
              innovista.grp@gmail.com
            </a>
          </p>
        </div>
      </section>
    </main>
  );
}
