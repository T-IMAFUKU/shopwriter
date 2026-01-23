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

const IMG_CLASS =
  "mx-auto w-full max-w-3xl rounded-lg ring-1 ring-border/60 shadow-sm";

export default function LoginGuidePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-12 sm:py-14">
      {/* 0. ヒーロー（FIX） */}
      <header className="mb-12 sm:mb-14">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight leading-snug mb-2">
          ShopWriter ログイン・アカウント登録ガイド
        </h1>

        <p className="text-lg sm:text-xl font-semibold tracking-tight text-foreground/90 mb-4">
          アカウント登録に料金はかかりません
        </p>

        <p className="text-base sm:text-lg leading-relaxed text-muted-foreground">
          このページの手順どおり進めれば、英語が読めなくても大丈夫です。
        </p>
      </header>

      {/* 1. 翻訳ON */}
      <section className="mb-14 sm:mb-16">
        <h2 className="text-xl sm:text-2xl font-semibold tracking-tight mb-4">
          ① 英語を日本語に変えます
        </h2>

        <p className="text-base sm:text-lg leading-relaxed mb-4">
          画面右上（アドレスバーの右側）に出る「翻訳」アイコンをクリックし、
          表示されたメニューで「日本語」を選びます。
        </p>

        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed mb-6">
          ※ 翻訳アイコンが見当たらない場合は、ページ上で右クリックして
          「日本語に翻訳」を選んでも大丈夫です。
        </p>

        <Image
          src="/login/chrome-translate-on.png"
          alt="Chromeの翻訳アイコンから日本語に切り替える"
          width={1200}
          height={675}
          className={IMG_CLASS}
        />
      </section>

      {/* 2. ログイン or 新規登録 */}
      <section className="mb-14 sm:mb-16">
        <h2 className="text-xl sm:text-2xl font-semibold tracking-tight mb-6">
          ② GitHubのアカウントはありますか？
        </h2>

        <h3 className="text-base sm:text-lg font-semibold mb-3">すでにある方</h3>
        <p className="text-base sm:text-lg leading-relaxed mb-4">
          メールアドレスとパスワードでサインインしてください。
        </p>
        <Image
          src="/login/github-signin.png"
          alt="GitHub サインイン画面"
          width={1200}
          height={675}
          className={IMG_CLASS}
        />

        <div className="h-10" />

        <h3 className="text-base sm:text-lg font-semibold mb-3">初めての方</h3>
        <p className="text-base sm:text-lg leading-relaxed mb-4">
          「アカウントを作成」をクリックします。
        </p>
        <Image
          src="/login/github-create-account.png"
          alt="GitHub 新規アカウント作成"
          width={1200}
          height={675}
          className={IMG_CLASS}
        />
      </section>

      {/* 3. 新規登録入力 */}
      <section className="mb-14 sm:mb-16">
        <h2 className="text-xl sm:text-2xl font-semibold tracking-tight mb-4">
          ③ 必要な情報を入力します
        </h2>
        <ul className="list-disc pl-5 text-base sm:text-lg leading-relaxed mb-6">
          <li>メールアドレス</li>
          <li>パスワード</li>
          <li>ユーザー名</li>
        </ul>
        <Image
          src="/login/github-signup-form.png"
          alt="GitHub 登録情報入力"
          width={1200}
          height={675}
          className={IMG_CLASS}
        />
      </section>

      {/* 4. 不正ログイン防止の認証 */}
      <section className="mb-14 sm:mb-16">
        <h2 className="text-xl sm:text-2xl font-semibold tracking-tight mb-4">
          ④ 不正ログイン防止のための認証があります
        </h2>

        <p className="text-base sm:text-lg leading-relaxed mb-6">
          途中で簡単な確認が表示されます。「Visual puzzle」をクリックして、
          画面の指示どおり進めてください。
        </p>

        <Image
          src="/login/github-certification.png"
          alt="GitHub 認証の選択画面（Visual puzzle）"
          width={1200}
          height={675}
          className={IMG_CLASS}
        />

        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed mt-6 mb-6">
          数秒で終わります。
        </p>

        <Image
          src="/login/github-puzzle.png"
          alt="GitHub 不正ログイン防止の認証パズル"
          width={1200}
          height={675}
          className={IMG_CLASS}
        />
      </section>

      {/* 5. メール確認 */}
      <section className="mb-14 sm:mb-16">
        <h2 className="text-xl sm:text-2xl font-semibold tracking-tight mb-4">
          ⑤ メールを確認します
        </h2>

        <p className="text-base sm:text-lg leading-relaxed mb-6">
          登録したメールアドレスに確認コードが届きます。メールを開いてコードを入力してください。
        </p>

        <Image
          src="/login/github-email-verify.png"
          alt="GitHub メール確認コード入力"
          width={1200}
          height={675}
          className={IMG_CLASS}
        />
      </section>

      {/* 6. 完了 */}
      <section className="mb-8">
        <h2 className="text-xl sm:text-2xl font-semibold tracking-tight mb-4">
          ⑥ 登録が完了すると、ShopWriterに戻ります
        </h2>
        <p className="text-base sm:text-lg leading-relaxed">
          画面が切り替わってShopWriterが表示されたら、登録は完了です。
        </p>
      </section>

      {/* フッター注意 */}
      <section className="mt-12 text-xs sm:text-sm text-muted-foreground">
        <p>※ 上記の画面は GitHub の登録画面です。</p>
      </section>
    </main>
  );
}
