// app/login/page.tsx
// ShopWriter Login Guide (Chrome版)
// 目的：英語が読めなくても GitHub アカウント登録を完了できる日本語ガイド
// 方針：読ませない・判断させない・同じ操作をさせる

import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LogIn } from "lucide-react";

export const metadata = {
  title: "ログイン・アカウント登録 | ShopWriter",
  description:
    "英語が読めなくても大丈夫。GitHubアカウントを使ってShopWriterを始めるための日本語ガイドです。",
};

const IMG_CLASS =
  "mx-auto w-full max-w-3xl rounded-lg ring-1 ring-border/60 shadow-sm";

const btnPrimary =
  "rounded-xl shadow-sm md:shadow-md bg-gradient-to-r from-indigo-600 to-blue-600 text-white transition-all duration-200 hover:brightness-110 hover:-translate-y-[1px] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500";

export default function LoginGuidePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-12 sm:py-14">
      {/* 0. ヒーロー（FIX） */}
      <header className="mb-12 sm:mb-14">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight leading-snug mb-2">
          ShopWriter ログイン・アカウント登録ガイド
        </h1>

        <p className="text-lg sm:text-xl font-semibold tracking-tight text-foreground/90 mb-3">
          アカウント登録に料金はかかりません
        </p>

        <p className="text-base sm:text-lg leading-relaxed text-muted-foreground">
          このページの手順どおり進めれば、英語が読めなくても大丈夫です。
        </p>

        {/* ✅ 入口：ログイン / 新規登録 をここで迷わせない */}
        <div className="mt-6 rounded-2xl border bg-white/70 p-4 sm:p-5 shadow-sm backdrop-blur dark:bg-white/10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm sm:text-base font-semibold">
                ログイン / アカウント作成
              </p>
              <p className="mt-1 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                このボタンから GitHub へ進みます。初めての方は GitHub 画面で
                「Create an account（アカウント作成）」を選べます。
                <span className="ml-2">
                  <Link
                    href="#step-2-new"
                    className="underline underline-offset-4 hover:text-foreground"
                    aria-label="初めての方（②の初めての方へ）"
                  >
                    初めての方は②へ →
                  </Link>
                </span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button asChild className={btnPrimary + " h-10 px-4"}>
                <Link href="/api/auth/signin" aria-label="ログイン・アカウント作成へ">
                  <LogIn className="mr-2 h-4 w-4" aria-hidden />
                  ログインへ
                </Link>
              </Button>

              <a
                href="https://github.com/password_reset"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                パスワードを忘れた場合
              </a>
            </div>
          </div>
        </div>

        {/* ✅ 余計な導線は置かない（登録ガイドに集中） */}
        <div className="mt-3">
          <Link
            href="/"
            className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
            aria-label="トップに戻る"
          >
            ← トップに戻る
          </Link>
        </div>
      </header>

      {/* 1. 翻訳ON */}
      <section className="mb-14 sm:mb-16" id="step-1">
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
      <section className="mb-14 sm:mb-16" id="step-2">
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

        {/* ✅ アンカー位置ズレ対策：固定ヘッダー分だけ下げる */}
        <h3
          id="step-2-new"
          className="scroll-mt-24 text-base sm:text-lg font-semibold mb-3"
        >
          初めての方
        </h3>
        <p className="text-base sm:text-lg leading-relaxed mb-4">
          「アカウントを作成（Create an account）」をクリックします。
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
      <section className="mb-14 sm:mb-16" id="step-3">
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
      <section className="mb-14 sm:mb-16" id="step-4">
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
      <section className="mb-14 sm:mb-16" id="step-5">
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
      <section className="mb-8" id="step-6">
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
