// app/help/billing-plan/page.tsx
import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "課金・プランで困ったとき | ShopWriter",
  description:
    "ShopWriterの課金・プランで困ったときの対処ガイドです。申し込んだのに反映されない、請求とプラン画面が開けない、解約や支払いエラーなどのケースをまとめています。",
};

export default function HelpBillingPlanPage() {
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
          <span aria-current="page">課金・プランで困ったとき</span>
        </p>

        <h1 className="text-2xl font-semibold tracking-tight">
          課金・プランで困ったとき
        </h1>

        <p className="text-sm text-muted-foreground">
          「申し込んだのに無料のまま」「請求とプランの画面が開けない」
          といった状況で困ったときのためのガイドです。
          多くの場合、数分で解決できる原因がほとんどです。
          上から順に確認してみてください。
        </p>
      </header>

      <div className="mt-8 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">0. まず確認（30秒チェック）</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ul className="list-disc space-y-1 pl-5">
              <li>画面右上にユーザーメニューや Dashboard への導線が表示されていますか？</li>
              <li>画面を更新しても同じ状態ですか？</li>
              <li>
                <Link href="/account/billing" className="underline underline-offset-4">
                  請求とプラン（/account/billing）
                </Link>{" "}
                を開けますか？
              </li>
            </ul>
            <p className="text-muted-foreground">
              請求とプランの画面が開けない場合は、
              <Link href="/help/login" className="underline underline-offset-4 ml-1">
                ログインで困ったとき
              </Link>
              を先に確認してください。
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. よくある症状から探す</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ul className="list-disc space-y-1 pl-5">
              <li>A：申し込んだのに「無料」のまま変わらない</li>
              <li>B：「請求とプラン」ページが開けない／エラーになる</li>
              <li>C：プラン変更したのに反映されない</li>
              <li>D：解約したのに表示が変わらない</li>
              <li>E：支払いエラー／カード更新が必要と言われる</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              2. A：申し込んだのに「無料」のまま変わらない
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ul className="list-disc space-y-1 pl-5">
              <li>数分待ってからページを更新する</li>
              <li>サインアウト → 再ログインする</li>
              <li>/account/billing を開き直す</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              3. B：「請求とプラン」ページが開けない
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ul className="list-disc space-y-1 pl-5">
              <li>ログイン状態を確認する</li>
              <li>401 / 403 / 500 などの表示を控える</li>
              <li>別ブラウザ・別端末で開けるか試す</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              4. C：プラン変更したのに反映されない
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ul className="list-disc space-y-1 pl-5">
              <li>ページ更新・再ログインを試す</li>
              <li>/account/billing の表示を基準に確認する</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              5. D：解約したのに表示が変わらない
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ul className="list-disc space-y-1 pl-5">
              <li>/account/billing の表示を基準に確認する</li>
              <li>ページ更新・再ログインを試す</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              6. E：支払いエラー／カード更新が必要
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ul className="list-disc space-y-1 pl-5">
              <li>/account/billing からカード情報を更新する</li>
              <li>別ブラウザ・別端末で手続きする</li>
              <li>表示されたエラーメッセージを控える</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">7. 問い合わせに必要な情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ul className="list-disc space-y-1 pl-5">
              <li>該当する症状（A〜E）</li>
              <li>発生時刻</li>
              <li>使用環境（OS / ブラウザ / 端末）</li>
              <li>表示されたエラーメッセージ（あれば）</li>
              <li>スクリーンショット（可能な場合）</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">8. 関連リンク</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <Link href="/account/billing" className="underline underline-offset-4">
                  請求とプラン
                </Link>
              </li>
              <li>
                <Link href="/help/login" className="underline underline-offset-4">
                  ログインで困ったとき
                </Link>
              </li>
              <li>
                <Link href="/feedback" className="underline underline-offset-4">
                  フィードバック送信
                </Link>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
