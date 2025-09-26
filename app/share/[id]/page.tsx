import Link from "next/link";

type PageProps = { params: { id: string } };

export default function ShareDetailPage({ params }: PageProps) {
  const { id } = params;
  return (
    <main className="container mx-auto max-w-2xl py-8 space-y-4">
      <h1 className="text-2xl font-bold">Share 詳細</h1>

      <div className="rounded-xl border p-4">
        <div className="text-sm text-muted-foreground">ID</div>
        <div className="text-lg font-mono">{id}</div>
      </div>

      <p className="text-sm text-muted-foreground">
        ※ ここはルーティング確認用の最小ページです。実データ接続は
        「MVP: テンプレ管理（CRUD）」で実装します。
      </p>

      <div className="pt-2">
        <Link href="/" className="underline">← トップへ戻る</Link>
      </div>
    </main>
  );
}
