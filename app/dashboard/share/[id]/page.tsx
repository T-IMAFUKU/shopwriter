// app/dashboard/share/[id]/page.tsx  ———— 〈全文置換〉
import { Metadata } from "next";
import ShareCard from "@/components/share/ShareCard";

type ShareStatus = "public" | "draft";

type ShareDetail = {
  id: string;
  title: string;
  description: string | null;
  status: ShareStatus; // 小文字で返る前提
  createdAtISO: string;
  updatedAtISO: string;
};

export const metadata: Metadata = {
  title: "Share Detail",
};

function mapStatusToCard(status: ShareStatus): "Public" | "Draft" {
  return status === "public" ? "Public" : "Draft";
}

async function getShare(id: string): Promise<ShareDetail> {
  // 相対パス fetch（App Router のサーバー環境で可）
  const url =
    (process.env.NEXT_PUBLIC_APP_URL ?? "") + `/api/shares/${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    // ビルド時キャッシュを抑止（常に最新）
    cache: "no-store",
    // Next.js の再検証ヒント（0=都度）
    next: { revalidate: 0 },
    headers: {
      // ここで認証ヘッダが必要なら追加（DEV 用など）
      // "X-User-Id": process.env.ALLOW_DEV_HEADER ? "dev-user" : "",
    },
  });

  if (!res.ok) {
    // 404/401 などは例外に
    throw new Error(`Failed to fetch /api/shares/${id}: ${res.status}`);
  }
  const data = (await res.json()) as ShareDetail;
  return data;
}

export default async function Page({
  params,
}: {
  params: { id: string };
}) {
  const id = params.id;
  const item = await getShare(id);

  return (
    <main className="container mx-auto max-w-4xl py-6">
      <h1 className="mb-4 text-xl font-semibold">共有詳細</h1>

      <ShareCard
        id={item.id}
        title={item.title}
        description={item.description ?? undefined}
        // ★ 小文字 → 大文字マッピングで型を満たす
        status={mapStatusToCard(item.status)}
        createdAtISO={item.createdAtISO}
        updatedAtISO={item.updatedAtISO}
      />
    </main>
  );
}
