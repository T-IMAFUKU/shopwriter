// app/login/page.tsx
// ShopWriter Login Guide (Chrome版)
// 目的：英語が読めなくても GitHub アカウント登録を完了できる日本語ガイド
// 方針：読ませない・判断させない・同じ操作をさせる

import Image from "next/image";

export const metadata = {
  title: "ログイン・アカウント登録 | ShopWriter",
  description:
    "英語が読めなくても大丈夫。GitHubアカウントを使ってShopWriterを始めるための日本語ガイドです。",
};

export default function LoginGuidePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      {/* 0. ヒーロー */}
      <section className="mb-10">
        <h1 className="text-2xl font-bold mb-2">
          アカウント登録に料金はかかりません
        </h1>
        <p className="text-sm text-muted-foreground">
          このページの手順どおり進めれば、英語が読めなくても登録できます。
        </p>
      </section>

      {/* 1. 翻訳ON */}
      <section className="mb-12">
        <h2 className="text-lg font-semibold mb-2">
          ① 英語を日本語に変えます
        </h2>
        <p className="mb-4">
          画面上で右クリックして「日本語に翻訳」を選んでください。
        </p>
        <Image
          src="/login/chrome-translate-on.png"
          alt="Chromeで日本語に翻訳する"
          width={800}
          height={450}
          className="rounded border"
        />
      </section>

      {/* 2. ログイン or 新規登録 */}
      <section className="mb-12">
        <h2 className="text-lg font-semibold mb-4">
          ② GitHubのアカウントはありますか？
        </h2>

        <h3 className="font-semibold mb-2">すでにある方</h3>
        <p className="mb-3">
          メールアドレスとパスワードでサインインしてください。
        </p>
        <Image
          src="/login/github-signin.png"
          alt="GitHub サインイン画面"
          width={800}
          height={450}
          className="rounded border mb-6"
        />

        <h3 className="font-semibold mb-2">初めての方</h3>
        <p className="mb-3">「アカウントを作成」をクリックします。</p>
        <Image
          src="/login/github-create-account.png"
          alt="GitHub 新規アカウント作成"
          width={800}
          height={450}
          className="rounded border"
        />
      </section>

      {/* 3. 新規登録入力 */}
      <section className="mb-12">
        <h2 className="text-lg font-semibold mb-2">
          ③ 必要な情報を入力します
        </h2>
        <ul className="list-disc pl-5 mb-4">
          <li>メールアドレス</li>
          <li>パスワード</li>
          <li>ユーザー名</li>
        </ul>
        <Image
          src="/login/github-signup-form.png"
          alt="GitHub 登録情報入力"
          width={800}
          height={450}
          className="rounded border"
        />
      </section>

      {/* 4. 人間確認 */}
      <section className="mb-12">
        <h2 className="text-lg font-semibold mb-2">
          ④ 人間かどうかの確認があります
        </h2>
        <p className="mb-4">
          表示された指示どおりに操作してください。
        </p>
        <Image
          src="/login/github-puzzle.png"
          alt="GitHub 人間確認パズル"
          width={800}
          height={450}
          className="rounded border"
        />
      </section>

      {/* 5. メール確認 */}
      <section className="mb-12">
        <h2 className="text-lg font-semibold mb-2">
          ⑤ メールを確認します
        </h2>
        <p className="mb-4">
          この画面のまま、メールを開いて大丈夫です。
        </p>
        <Image
          src="/login/github-email-verify.png"
          alt="GitHub メール確認コード入力"
          width={800}
          height={450}
          className="rounded border"
        />
      </section>

      {/* 6. 完了 */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">
          ⑥ 登録が完了すると、ShopWriterに戻ります
        </h2>
        <p>
          画面が切り替わってShopWriterが表示されたら、登録は完了です。
        </p>
      </section>

      {/* フッター注意 */}
      <section className="mt-10 text-xs text-muted-foreground">
        <p>※ 上記の画面は GitHub の登録画面です。</p>
      </section>
    </main>
  );
}
