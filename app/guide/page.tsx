// app/guide/page.tsx
// 使用システム：Next.js App Router

export const metadata = {
  title: "利用ガイド | ShopWriter",
};

export default function GuidePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 text-sm leading-7">
      <h1 className="mb-8 text-2xl font-bold">ShopWriter 利用ガイド</h1>

      <h2 className="mt-10 mb-4 text-xl font-semibold">ShopWriterでできること</h2>
      <p>
        ShopWriterは、<br />
        商品やサービスの説明文を、スムーズに形にするためのツールです。
      </p>
      <p className="mt-4">
        画面に表示されている項目を、上から順に入力していくだけで、
        紹介文のベースとなる文章を作ることができます。
      </p>
      <p className="mt-4">
        文章が得意でなくても大丈夫です。<br />
        必要なのは、商品について「分かっていること」だけです。
      </p>

      <h2 className="mt-12 mb-4 text-xl font-semibold">STEP 1｜商品名を入力する</h2>
      <p>まずは、商品名を入力します。</p>
      <ul className="mt-4 list-disc pl-6">
        <li>実際に使っている名称</li>
        <li>仮の名前でもOKです</li>
      </ul>
      <p className="mt-4">
        ここで入力した商品名は、<br />
        文章の中でそのまま使われます。
      </p>

      <h2 className="mt-12 mb-4 text-xl font-semibold">STEP 2｜用途・目的を入力する</h2>
      <p>次に、この商品が何のためのものかを入力します。</p>
      <p className="mt-4">たとえば、</p>
      <ul className="mt-2 list-disc pl-6">
        <li>肌の乾燥を防ぐため</li>
        <li>作業時間を短縮するため</li>
        <li>初心者でも安心して使えるように</li>
      </ul>
      <p className="mt-4">
        「どんな場面で役立つか」を意識すると、<br />
        文章がより分かりやすくなります。
      </p>

      <h2 className="mt-12 mb-4 text-xl font-semibold">STEP 3｜特徴・強みを入力する</h2>
      <p>次は、商品の特徴や強みです。</p>
      <ul className="mt-4 list-disc pl-6">
        <li>他の商品と違うところ</li>
        <li>特に伝えたいポイント</li>
        <li>数字や実績があれば、それもOK</li>
      </ul>
      <p className="mt-4">
        箇条書きや、短い言葉のままで問題ありません。
      </p>

      <h2 className="mt-12 mb-4 text-xl font-semibold">STEP 4｜ターゲットを入力する</h2>
      <p>最後に、どんな人に向けた商品かを入力します。</p>
      <p className="mt-4">たとえば、</p>
      <ul className="mt-2 list-disc pl-6">
        <li>初めて使う人</li>
        <li>忙しい社会人</li>
        <li>小規模事業者</li>
      </ul>
      <p className="mt-4">
        ここを入れることで、<br />
        文章の言い回しが自然に調整されます。
      </p>

      <h2 className="mt-12 mb-4 text-xl font-semibold">STEP 5｜文章を作成する</h2>
      <p>
        すべて入力したら、文章を作成します。<br />
        数秒で、そのまま使える形の文章が表示されます。
      </p>
      <p className="mt-4">
        表示された文章は、自由に編集できます。<br />
        気になるところがあれば、内容を少し変えて、もう一度作ってみてください。
      </p>

      <h2 className="mt-12 mb-4 text-xl font-semibold">こんな場面で使えます</h2>
      <ul className="list-disc pl-6">
        <li>商品ページの説明文</li>
        <li>サービス紹介文の下書き</li>
        <li>販促や案内用の文章</li>
      </ul>
      <p className="mt-4">
        「何から書けばいいか分からない」状態でも、<br />
        ここから始められます。
      </p>

      <h2 className="mt-12 mb-4 text-xl font-semibold">まずは一度、試してみてください</h2>
      <p>
        最初から完璧に入力する必要はありません。<br />
        今わかっていることだけで大丈夫です。
      </p>
      <p className="mt-4">
        一度文章を作ってみて、<br />
        そこから整えていく方が、ずっと楽に進みます。
      </p>

      <div className="mt-12 rounded-lg border p-6 text-center">
        <p className="mb-4 font-semibold">さっそく使ってみる</p>
        <a
          href="/writer"
          className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 font-medium text-white hover:opacity-90"
        >
          ▶ Writerを開いて文章を作成する
        </a>
      </div>
    </main>
  );
}
