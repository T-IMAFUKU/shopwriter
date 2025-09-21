// /app/dashboard/page.tsx
// 逶ｮ逧・ｼ咼ashboard 荳隕ｧ縺ｫ ShareCard 繧貞・蛻ｩ逕ｨ・・SR縺ｧ /api/shares 繧貞叙蠕暦ｼ・
// 繝昴う繝ｳ繝茨ｼ壹し繝ｼ繝舌・蛛ｴfetch譎ゅ↓ "cookie" 繧貞ｧ碑ｭｲ縺励↑縺・→ 401・域悴隱崎ｨｼ・峨↓縺ｪ繧九◆繧√”eaders() 縺九ｉCookie繧定ｻ｢騾√☆繧九・

import Link from "next/link";
import { headers } from "next/headers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ShareCard, { type ShareData } from "@/components/share/ShareCard";

export const revalidate = 0;             // 蟶ｸ縺ｫ譛譁ｰ
export const dynamic = "force-dynamic";  // SSR 蠑ｷ蛻ｶ

type ApiShare = {
  id: string;
  title?: string | null;
  url?: string | null;
  isPublic?: boolean | null;
  createdAt?: string | null;
};

async function fetchShares(): Promise<ShareData[]> {
  const hdrs = headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const baseUrl = `${proto}://${host}`;

  // 笘・驥崎ｦ・ｼ壹し繝ｼ繝舌・fetch縺ｧ繧りｪ崎ｨｼ繧ｯ繝・く繝ｼ繧定ｻ｢騾√☆繧・
  const cookie = hdrs.get("cookie") ?? "";

  const res = await fetch(`${baseUrl}/api/shares?limit=50`, {
    cache: "no-store",
    headers: { cookie },
  });

  if (res.status === 401) {
    // 譛ｪ繝ｭ繧ｰ繧､繝ｳ or 繧ｻ繝・す繝ｧ繝ｳ譛ｪ蟋碑ｭｲ
    return [];
  }
  if (!res.ok) {
    return [];
  }

  const data = await res.json().catch(() => null);

  // 譛溷ｾ・ｽ｢・嘴 items: ApiShare[], nextBefore?: string | null } 繧ゅ＠縺上・ 逶ｴ謗･驟榊・
  const arr: ApiShare[] = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];

  // API繝ｬ繧ｹ繝昴Φ繧ｹ 竊・ShareData 縺ｸ豁｣隕丞喧
  const items: ShareData[] = arr
    .filter((x) => typeof x?.id === "string")
    .map((x) => ({
      id: x.id,
      title: x.title ?? null,
      url: x.url ?? null,
      isPublic: Boolean(x.isPublic ?? false),
      createdAt: x.createdAt ?? null,
    }));

  return items;
}

export default async function DashboardPage() {
  const shares = await fetchShares();

  return (
    <div className="container mx-auto max-w-5xl py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/writer">譁ｰ隕丈ｽ懈・</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard">譖ｴ譁ｰ</Link>
          </Button>
        </div>
      </div>

      {shares.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>蜈ｱ譛我ｸ隕ｧ</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              蜈ｱ譛峨ョ繝ｼ繧ｿ縺後∪縺縺ゅｊ縺ｾ縺帙ｓ縲ょ承荳翫・縲梧眠隕丈ｽ懈・縲阪°繧我ｽ懈・縺励※縺上□縺輔＞縲・
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {shares.map((s) => (
            <ShareCard key={s.id} share={s} />
          ))}
        </div>
      )}
    </div>
  );
}
