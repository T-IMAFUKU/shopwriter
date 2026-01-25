// app/help/login/page.tsx
import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "ログインで困ったとき | ShopWriter",
  description:
    "ShopWriterのログインで困ったときの対処ガイドです。ログインできない、ログイン後に進めない、アカウント切替、真っ白・読み込みが終わらない等のケースをまとめています。",
};

export default function HelpLoginPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <header className="space-y-2">
        <p className="text-sm text-muted-foreground">
          <Link href="/" className="underline underline-offset-4">
            Home
          </Link>
          <span className="mx-2">/</span>
          <Link href="/help" className="underline underline-offset-4">
            Help
          </Link>
          <span className="mx-2">/</span>
          <span aria-current="page">ログインで困ったとき</span>
        </p>

        <h1 className="text-2xl font-semibold tracking-tight">
          ログインで困ったとき
        </h1>

        <p className="text-sm text-muted-foreground">
          「ログインできない」「ログインしたはずなのに先に進めない」などの状況で困ったときのガイドです。
          多くの場合、数分で解決できる原因がほとんどです。上から順に確認してみてください。
        </p>
      </header>

      <div className="mt-8 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              1. よくある症状から探す
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>当てはまる症状を選んでください。</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>A：ログインボタンを押しても、元の画面に戻ってしまう</li>
              <li>B：ログインしたはずなのに、ダッシュボードに入れない</li>
              <li>C：別のアカウントでログインし直したい</li>
              <li>D：画面が真っ白になる／ずっと読み込み中</li>
              <li>E：エラーメッセージが表示される</li>
            </ul>
            <p className="text-muted-foreground">
              それぞれ、以下で対処方法を説明します。
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              2. A：ログインできない（押しても進まない／戻される）
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              この症状は、<span className="font-medium">ブラウザの設定や拡張機能</span>
              が原因のことが多いです。
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>ブラウザのポップアップブロックを一時的に解除する</li>
              <li>広告ブロッカー・トラッキング防止系の拡張機能を一時OFFにする</li>
              <li>サードパーティCookieを制限している場合、例外設定を追加する</li>
              <li>端末の日時設定が自動になっているか確認する</li>
            </ul>
            <p>
              それでも解決しない場合は、
              <span className="font-medium">シークレット</span> →{" "}
              <span className="font-medium">別ブラウザ</span> →{" "}
              <span className="font-medium">別端末</span>
              の順で切り分けてみてください。
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              3. B：ログイン後にダッシュボードへ入れない
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>ログイン状態と画面表示がズレている可能性があります。</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>一度サインアウトしてから、再度ログインする</li>
              <li>開いている ShopWriter のタブをすべて閉じてから再ログインする</li>
              <li>URL を直接開く（例：/dashboard）</li>
            </ul>
            <p className="text-muted-foreground">
              画面に 401 / 403 などの表示が出ている場合は、そのまま控えておくと問い合わせ時に役立ちます。
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              4. C：アカウントを切り替えたい（別のGitHubでログインしたい）
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>アカウントを切り替える場合は、次の手順がおすすめです。</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>ShopWriter からサインアウト</li>
              <li>GitHub 側で使用したいアカウントに切り替える</li>
              <li>再度ログインする</li>
            </ol>
            <p className="text-muted-foreground">
              うまく切り替わらない場合は、シークレットウィンドウでログインすると混線を防げます。
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              5. D：画面が真っ白／読み込みが終わらない
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>次の順で確認してください。</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>ハードリロード（Windows：Ctrl + F5）</li>
              <li>このサイトのキャッシュのみ削除</li>
              <li>拡張機能をOFFにして再読み込み</li>
              <li>シークレットウィンドウで再確認</li>
            </ul>
            <p className="text-muted-foreground">
              それでも解決しない場合は、次の情報を添えてお問い合わせください。
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              6. E：エラーメッセージが表示される場合
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>スムーズな対応のため、以下を教えてください。</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>該当する症状（A〜E）</li>
              <li>使用している環境（OS / ブラウザ / PC or スマホ）</li>
              <li>発生したおおよその時刻</li>
              <li>表示されたエラーメッセージ（あれば）</li>
              <li>スクリーンショット（可能な場合）</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">7. 関連リンク</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <Link href="/share/guide" className="underline underline-offset-4">
                  共有の使い方
                </Link>
              </li>
              <li className="text-muted-foreground">よくある質問（FAQ）※今後拡充予定</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
