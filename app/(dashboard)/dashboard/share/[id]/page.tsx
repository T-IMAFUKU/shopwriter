// app/(dashboard)/dashboard/share/[id]/page.tsx
import type { Metadata } from "next";
import { headers } from "next/headers";
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
  title: "共有詳細 | ShopWriter",
};

function mapStatusToCard(status: ShareStatus): "Public" | "Draft" {
  return status === "public" ? "Public" : "Draft";
}

function getBaseUrlFromHeaders(): string {
  const h = headers();

  // Vercel/Proxy では x-forwarded-* が基本。なければ host を使う。
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host");

  if (!host) {
    throw new Error("Failed to build base URL: missing host header");
  }

  return `${proto}://${host}`;
}

async function getShare(id: string): Promise<ShareDetail> {
  const base = getBaseUrlFromHeaders();
  const url = new URL(`/api/shares/${encodeURIComponent(id)}`, base).toString();

  const res = await fetch(url, {
    // no-store で十分（revalidate との二重指定を避ける）
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status}`);
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
