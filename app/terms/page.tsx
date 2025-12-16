// app/terms/page.tsx
import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="mb-8 text-3xl font-bold">利用規約</h1>

      <p className="mb-6 text-sm text-muted-foreground">
        本利用規約（以下「本規約」といいます。）は、イノビスタ株式会社（以下「当社」といいます。）が提供する
        AIライティング支援サービス「ShopWriter」（以下「本サービス」といいます。）の利用条件を定めるものです。
        ユーザーの皆様には、本規約に同意のうえ、本サービスをご利用いただきます。
      </p>

      <section className="space-y-6">
        <div>
          <h2 className="font-semibold">第1条（適用）</h2>
          <p>
            本規約は、ユーザーと当社との間の本サービスの利用に関わる一切の関係に適用されます。
            当社が本サービス上で随時掲載するルール等は、本規約の一部を構成するものとします。
          </p>
        </div>

        <div>
          <h2 className="font-semibold">第2条（利用登録）</h2>
          <p>
            本サービスの利用を希望する者は、本規約に同意のうえ、当社所定の方法により利用登録を行うものとします。
            当社は、登録申請者に以下の事由があると判断した場合、登録を承認しないことがあります。
          </p>
          <ul className="list-disc pl-6">
            <li>虚偽の情報を届け出た場合</li>
            <li>本規約に違反したことがある者である場合</li>
            <li>その他、当社が不適切と判断した場合</li>
          </ul>
        </div>

        <div>
          <h2 className="font-semibold">第3条（利用料金および支払方法）</h2>
          <p>
            ユーザーは、本サービスの有料プランを利用する場合、当社が別途定める利用料金を、
            Stripe, Inc. が提供する決済システムを利用して支払うものとします。
          </p>
          <p>
            利用料金は月額サブスクリプション方式で課金され、申込時または更新時に請求されます。
          </p>
        </div>

        <div>
          <h2 className="font-semibold">第4条（禁止事項）</h2>
          <p>ユーザーは、本サービスの利用にあたり、以下の行為をしてはなりません。</p>
          <ul className="list-disc pl-6">
            <li>法令または公序良俗に違反する行為</li>
            <li>犯罪行為に関連する行為</li>
            <li>本サービスの運営を妨害する行為</li>
            <li>他のユーザーまたは第三者の権利を侵害する行為</li>
            <li>不正アクセス、リバースエンジニアリング等の行為</li>
            <li>その他、当社が不適切と判断する行為</li>
          </ul>
        </div>

        <div>
          <h2 className="font-semibold">第5条（本サービスの提供の停止等）</h2>
          <p>
            当社は、以下の事由がある場合、ユーザーに事前に通知することなく、
            本サービスの全部または一部の提供を停止または中断することがあります。
          </p>
          <ul className="list-disc pl-6">
            <li>システムの保守点検または更新を行う場合</li>
            <li>地震、火災、停電などの不可抗力が発生した場合</li>
            <li>その他、当社が提供困難と判断した場合</li>
          </ul>
        </div>

        <div>
          <h2 className="font-semibold">第6条（解約および返金）</h2>
          <p>
            ユーザーは、所定の方法により、いつでも本サービスの利用を解約することができます。
            解約後も、当該利用期間の終了日までは本サービスを利用することができます。
          </p>
          <p>
            本サービスはデジタルコンテンツの性質上、原則として支払済みの利用料金の返金は行いません。
            ただし、当社の責に帰すべき事由によりサービスが正常に提供されなかった場合は、
            個別に対応するものとします。
          </p>
        </div>

        <div>
          <h2 className="font-semibold">第7条（免責事項）</h2>
          <p>
            当社は、本サービスに事実上または法律上の瑕疵がないことを保証するものではありません。
            本サービスの利用によりユーザーに生じた損害について、当社の故意または重過失による場合を除き、
            一切の責任を負いません。
          </p>
        </div>

        <div>
          <h2 className="font-semibold">第8条（規約の変更）</h2>
          <p>
            当社は、必要と判断した場合には、ユーザーに通知することなく本規約を変更することができます。
            変更後の規約は、本サービス上に掲載した時点から効力を生じるものとします。
          </p>
        </div>

        <div>
          <h2 className="font-semibold">第9条（準拠法・管轄）</h2>
          <p>
            本規約の解釈にあたっては、日本法を準拠法とします。
            本サービスに関して紛争が生じた場合には、当社本店所在地を管轄する裁判所を
            専属的合意管轄とします。
          </p>
        </div>

        <div>
          <h2 className="font-semibold">第10条（お問い合わせ先）</h2>
          <p>
            本規約に関するお問い合わせは、以下までご連絡ください。
          </p>
          <p className="mt-2 text-sm">
            イノビスタ株式会社<br />
            メールアドレス：{" "}
            <a
              href="mailto:innovista.grp@gmail.com"
              className="underline"
            >
              innovista.grp@gmail.com
            </a>
          </p>
        </div>
      </section>

      <div className="mt-12 text-sm text-muted-foreground">
        <Link href="/privacy" className="underline">
          プライバシーポリシー
        </Link>{" "}
        ／{" "}
        <Link href="/legal/tokushoho" className="underline">
          特定商取引法に基づく表記
        </Link>
      </div>
    </main>
  );
}
