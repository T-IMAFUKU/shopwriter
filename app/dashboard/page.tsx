// app/dashboard/page.tsx  ———— 〈全文置換〉
import { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import ShareCard from "@/components/share/ShareCard";

// ここは実際のデータ取得に置き換わる想定（例: fetch / prisma）
// s.status は "public" | "draft" の小文字で返る想定
type ShareStatus = "public" | "draft";

type ShareItem = {
  id: string;
  title: string;
  description?: string | null;
  status: ShareStatus;
  createdAtISO: string;
  updatedAtISO: string;
};

export const metadata: Metadata = {
  title: "Dashboard",
};

function mapStatusToCard(status: ShareStatus): "Public" | "Draft" {
  return status === "public" ? "Public" : "Draft";
}

async function getShares(): Promise<ShareItem[]> {
  // TODO: 実装を差し替え
  return [
    {
      id: "demo-1",
      title: "デモ共有1",
      description: "説明テキスト",
      status: "public",
      createdAtISO: new Date().toISOString(),
      updatedAtISO: new Date().toISOString(),
    },
    {
      id: "demo-2",
      title: "デモ共有2",
      description: null,
      status: "draft",
      createdAtISO: new Date().toISOString(),
      updatedAtISO: new Date().toISOString(),
    },
  ];
}

export default async function Page() {
  const shares = await getShares();

  return (
    <main className="container mx-auto max-w-5xl py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Your Shares</h1>
        <Link href="/dashboard/new">
          <Button>新規作成</Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {shares.map((s) => (
          <ShareCard
            key={s.id}
            id={s.id}
            title={s.title}
            description={s.description ?? undefined}
            // ★ 小文字 → 大文字の型へマッピング
            status={mapStatusToCard(s.status)}
            createdAtISO={s.createdAtISO}
            updatedAtISO={s.updatedAtISO}
          />
        ))}
      </div>
    </main>
  );
}
