// app/legal/tokushoho/page.tsx
// 特定商取引法に基づく表記（ShopWriter 用・審査対応版）
//
// 方針:
// - runtime 指定はしない（Next.js デフォルトで運用）
// - 電話番号は「請求に関する問い合わせに限り遅滞なく開示」方式（番号は記載しない）
// - Stripe/法務観点で曖昧さが出やすい表現を最小修正（支払い時期/定期課金/返金）
//
// 年内リリース②（価格・税表記）:
// - 「税抜価格」であることを明記し、「※別途消費税がかかります」を併記
// - 表記揺れ（¥/円、/月、税込/税抜の混在）を統一

export default function TokushohoPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-left text-gray-900">
      <h1 className="mb-8 text-3xl font-bold">特定商取引法に基づく表記</h1>

      <section className="space-y-6">
        <div>
          <h2 className="font-semibold">販売事業者</h2>
          <p>イノビスタ株式会社（Innovista Inc.）</p>
        </div>

        <div>
          <h2 className="font-semibold">代表責任者</h2>
          <p>今福利樹</p>
        </div>

        <div>
          <h2 className="font-semibold">所在地</h2>
          <p>北海道札幌市西区琴似四条三丁目１－５</p>
        </div>

        <div>
          <h2 className="font-semibold">電話番号</h2>
          <p>
            電話番号は、請求に関するお問い合わせに限り、遅滞なく開示いたします。
            お問い合わせは、下記メールアドレスまでご連絡ください。
          </p>
        </div>

        <div>
          <h2 className="font-semibold">メールアドレス</h2>
          <p>innovista.grp@gmail.com</p>
        </div>

        <div>
          <h2 className="font-semibold">販売URL</h2>
          <p>
            <a
              href="https://shopwriter-next.vercel.app/"
              className="text-blue-600 underline"
            >
              https://shopwriter-next.vercel.app/
            </a>
          </p>
        </div>

        <div>
          <h2 className="font-semibold">販売価格</h2>
          <p>
            各プランページに記載（税抜価格）
            <br />
            ※別途消費税がかかります
            <br />
            ・無料プラン：無料（0円）
            <br />
            ・ベーシック：980円（税抜）/月（定期課金）
            <br />
            ・スタンダード：2,980円（税抜）/月（定期課金）
            <br />
            ・プレミアム：5,980円（税抜）/月（定期課金）
          </p>
        </div>

        <div>
          <h2 className="font-semibold">商品代金以外の必要料金</h2>
          <p>インターネット接続に伴う通信費はお客様負担となります。</p>
        </div>

        <div>
          <h2 className="font-semibold">支払い方法</h2>
          <p>クレジットカード（Stripe）</p>
        </div>

        <div>
          <h2 className="font-semibold">支払い時期</h2>
          <p>
            各プランの申込時に、当該月分の利用料金が課金されます。
            <br />
            引き落とし日はご利用のカード会社により異なります。
          </p>
        </div>

        <div>
          <h2 className="font-semibold">提供時期</h2>
          <p>決済完了後、即時利用可能。</p>
        </div>

        <div>
          <h2 className="font-semibold">返品・キャンセルについて</h2>
          <p>
            サービスの性質上、購入後の返金・キャンセルは原則としてお受けできません。
            ただし、二重課金などの不具合が発生した場合には個別対応いたします。
          </p>
        </div>

        <div>
          <h2 className="font-semibold">動作環境</h2>
          <p>最新の Web ブラウザが利用可能な環境。</p>
        </div>

        <div>
          <h2 className="font-semibold">中途解約について</h2>
          <p>
            月途中で解約された場合も日割りでの返金は行っておりません。
            解約後も次回請求日まではサービスを利用できます。
          </p>
        </div>
      </section>
    </main>
  );
}
