// app/(dashboard)/dashboard/share/[id]/page.tsx
import type { Metadata } from "next";
import ShareCard from "@/components/share/ShareCard";

type ShareStatus = "public" | "draft";

type ShareDetail = {
  id: string;
  title: string;
  description: string | null;
  status: ShareStatus;
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
  const url =
    (process.env.NEXT_PUBLIC_APP_URL ?? "") +
    `/api/shares/${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    cache: "no-store",
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch /api/shares/${id}: ${res.status}`);
  }
  const data = (await res.json()) as ShareDetail;
  return data;
}

export default async function Page({ params }: { params: { id: string } }) {
  const id = params.id;
  const item = await getShare(id);

  return (
    <main className="container mx-auto max-w-4xl py-6">
      <h1 className="mb-4 text-xl font-semibold">共有詳細</h1>

      <ShareCard
        id={item.id}
        title={item.title}
        description={item.description ?? undefined}
        status={mapStatusToCard(item.status)}
        createdAtISO={item.createdAtISO}
        updatedAtISO={item.updatedAtISO}
      />
    </main>
  );
}
