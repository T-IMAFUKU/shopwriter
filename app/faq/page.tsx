export const metadata = {
  title: "よくある質問（FAQ） | ShopWriter",
  description:
    "ShopWriterのFAQ。GitHub/Stripeへの不安を日本語で解消し、あわせて利用に関する質問にも答えます。",
};

type Block = {
  q: string;
  a: React.ReactNode;
};

const GITHUB_STRIPE_FAQ: Block[] = [
  {
    q: "なぜ GitHub アカウントが必要なのですか？",
    a: (
      <>
        <p className="font-medium">ログインに使うためだけです。</p>
        <p className="mt-2">
          ShopWriterでは、ユーザー名・パスワードの管理を自前で行わず、
          GitHubの仕組みを使って安全にログインしています。
        </p>
        <p className="mt-2">
          <strong>
            コードを書いたり、GitHubを使い続ける必要はありません。
          </strong>
        </p>
      </>
    ),
  },
  {
    q: "GitHubを使ったことがなくても大丈夫ですか？",
    a: (
      <>
        <p className="font-medium">まったく問題ありません。</p>
        <p className="mt-2">やることは、</p>
        <ul className="mt-2 list-disc pl-5">
          <li>GitHubに登録する</li>
          <li>ログイン時にボタンを押す</li>
        </ul>
        <p className="mt-2">
          これだけです。普段GitHubを使う必要はなく、
          <strong>ShopWriterのログイン以外で触ることはほぼありません。</strong>
        </p>
      </>
    ),
  },
  {
    q: "GitHubは英語ですが、英語が読めなくても使えますか？",
    a: (
      <>
        <p className="font-medium">使えます。</p>
        <p className="mt-2">
          ログインや登録時に表示される画面は英語ですが、操作は「ボタンを押す」だけです。
        </p>
        <p className="mt-2">
          英語の文章を読んだり、入力したりする必要はありません。
        </p>
      </>
    ),
  },
  {
    q: "Stripeとは何ですか？海外サービスで不安です。",
    a: (
      <>
        <p>
          Stripeは、<strong>世界中で使われている決済サービス</strong>です。
        </p>
        <ul className="mt-2 list-disc pl-5">
          <li>日本円に対応しています</li>
          <li>日本のクレジットカードが使えます</li>
          <li>多くの日本向けWebサービスでも利用されています</li>
        </ul>
        <p className="mt-2">
          ShopWriterでは、<strong>支払い処理のみ</strong>にStripeを使っています。
        </p>
      </>
    ),
  },
  {
    q: "クレジットカード情報はShopWriterに保存されますか？",
    a: (
      <>
        <p className="font-medium">保存されません。</p>
        <p className="mt-2">
          クレジットカード情報はすべてStripe側で管理され、
          <strong>ShopWriter側では一切保持しません。</strong>
        </p>
        <p className="mt-2">
          そのため、ShopWriterがカード番号を見ることも、保存することもありません。
        </p>
      </>
    ),
  },
  {
    q: "勝手に課金されることはありませんか？",
    a: (
      <>
        <p className="font-medium">ありません。</p>
        <ul className="mt-2 list-disc pl-5">
          <li>課金が発生するタイミングは明示されます</li>
          <li>プラン内容は事前に確認できます</li>
          <li>解約はいつでも行えます</li>
        </ul>
        <p className="mt-2">不明なまま料金が発生することはありません。</p>
      </>
    ),
  },
  {
    q: "GitHubやStripeの設定が難しそうで不安です。",
    a: (
      <>
        <p>ご安心ください。</p>
        <p className="mt-2">
          最初に必要な設定はありますが、一度終われば、
          <strong>その後は日本語のShopWriter画面だけで完結</strong>します。
        </p>
        <p className="mt-2">ShopWriter自体の操作は、とてもシンプルです。</p>
      </>
    ),
  },
];

const GENERAL_FAQ: Block[] = [
  {
    q: "ShopWriterとは何ですか？",
    a: (
      <>
        ShopWriterは、商品ページやSNS投稿などの「売れる文章」を作るための文章生成ツールです。
        日本語で迷わず使えることを重視しています。
      </>
    ),
  },
  {
    q: "どんな文章が作れますか？",
    a: (
      <>
        商品説明、特徴・ベネフィット、FAQ、SNS用の短文、CTA（購入の後押し文）などの作成に対応しています。
        目的に合わせてテンプレートを選ぶだけで形になります。
      </>
    ),
  },
  {
    q: "生成された文章はそのまま使って大丈夫ですか？",
    a: (
      <>
        そのまま使えるように設計していますが、最終確認は必ず行ってください（商品名・価格・素材・保証など）。
        特に法令表示や医療/美容の表現など、業界ルールがある場合はご自身でもチェックをお願いします。
      </>
    ),
  },
  {
    q: "プランや料金はどこで確認できますか？",
    a: (
      <>
        最新の内容は <a className="underline" href="/pricing">料金ページ</a> を確認してください。
      </>
    ),
  },
  {
    q: "解約やプラン変更はどこからできますか？",
    a: (
      <>
        <a className="underline" href="/account/billing">請求とプラン</a> から変更できます。
      </>
    ),
  },
  {
    q: "個人情報やデータの取り扱いが気になります",
    a: (
      <>
        取り扱い方針は <a className="underline" href="/privacy">プライバシーポリシー</a> に記載しています。
        不明点があればフィードバックからご連絡ください。
      </>
    ),
  },
];

export default function FaqPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <header className="mb-10">
        <h1 className="text-2xl font-semibold tracking-tight">よくある質問（FAQ）</h1>

        <div className="mt-6 rounded-xl border bg-muted/20 p-5">
          <h2 className="text-base font-semibold tracking-tight">
            GitHub・Stripeについての不安を解消します
          </h2>
          <p className="mt-3 text-sm text-muted-foreground leading-6">
            ShopWriterは、ログインや支払いのために<strong> GitHub </strong>と<strong> Stripe </strong>を利用しています。
            <br />
            どちらも英語表記が多いため、不安に感じる方もいるかもしれませんが、
            <strong>難しい操作や英語の理解は必要ありません。</strong>
            <br />
            ここでは、よくある不安点を日本語で説明します。
          </p>
        </div>
      </header>

      <section className="space-y-4">
        {GITHUB_STRIPE_FAQ.map((item, idx) => (
          <FaqAccordion key={`gs-${idx}`} q={item.q} a={item.a} />
        ))}
      </section>

      <hr className="my-10" />

      <section>
        <h2 className="text-lg font-semibold tracking-tight">その他のよくある質問</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          上記以外の質問はこちらをご確認ください。
        </p>

        <div className="mt-4 space-y-4">
          {GENERAL_FAQ.map((item, idx) => (
            <FaqAccordion key={`gen-${idx}`} q={item.q} a={item.a} />
          ))}
        </div>
      </section>

      <footer className="mt-12 rounded-xl border bg-muted/30 p-6">
        <p className="text-sm leading-6 text-muted-foreground">
          ここまで読んでも不安が解消しない場合は、無理に進む必要はありません。
          <br />
          ご不明な点や不安な点があれば、フィードバックからお気軽にお知らせください。
        </p>

        <a
          href="/feedback"
          className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          ▶ フィードバックを送る
        </a>

        <p className="mt-4 text-xs text-muted-foreground">
          さらに詳しい使い方は <a className="underline" href="/guide">利用ガイド</a> を参照してください。
        </p>
      </footer>
    </main>
  );
}

function FaqAccordion({ q, a }: { q: string; a: React.ReactNode }) {
  return (
    <details className="group rounded-xl border bg-background px-4 py-3 shadow-sm">
      <summary className="cursor-pointer list-none font-medium outline-none">
        <span className="mr-2 text-muted-foreground">Q.</span>
        {q}
        <span className="float-right text-muted-foreground transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="mt-3 text-sm leading-6 text-foreground/90">
        <div className="mb-1 text-muted-foreground">A.</div>
        <div>{a}</div>
      </div>
    </details>
  );
}
