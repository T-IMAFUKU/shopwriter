// FILE: app/page.tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Page() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      {/* Hero */}
      <section className="text-center space-y-4 mb-10">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">
          ShopWriter — 商品説明を、一瞬で。
        </h1>
        <p className="text-muted-foreground">
          Next.js + Prisma 構成のライティング支援SaaS。ヒーロー＋3カードのトップページです。
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Link href="/writer">
            <Button variant="secondary">無料で試す</Button>
          </Link>
          <Link href="/api/auth/signin">
            <Button variant="outline">GitHubでサインイン</Button>
          </Link>
        </div>
      </section>

      {/* 3 Cards */}
      <section className="grid md:grid-cols-3 gap-6">
        {/* Card 1: すぐに書ける */}
        <div className="rounded-2xl border p-6 space-y-4">
          <h2 className="text-xl font-bold">すぐに書ける</h2>
          <p className="text-sm text-muted-foreground">
            商品名と読者ターゲットから、下書きを自動生成。
          </p>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="quick-product">商品名（例：速乾タオル）</Label>
              <Input id="quick-product" placeholder="ShopWriter" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quick-audience">想定読者</Label>
              <Input id="quick-audience" placeholder="WEBユーザー" />
            </div>

            {/* ★ 生成するボタン（/writerへ遷移：まずはUI導線を用意） */}
            <Link href="/writer">
              <Button className="w-full">生成する</Button>
            </Link>
          </div>
        </div>

        {/* Card 2: テンプレ管理 */}
        <div className="rounded-2xl border p-6 space-y-4">
          <h2 className="text-xl font-bold">テンプレ管理</h2>
          <p className="text-sm text-muted-foreground">
            書式やトーンをテンプレ化し、量産を効率化。
            <br />
            「無料で試す」を押すとトーストで開始通知。ローディングは Skeleton 表現。
          </p>
        </div>

        {/* Card 3: Next.js + Prisma */}
        <div className="rounded-2xl border p-6 space-y-4">
          <h2 className="text-xl font-bold">Next.js 15 + Prisma</h2>
          <p className="text-sm text-muted-foreground">
            Neon(Postgres) と連携、Vercel に即デプロイ。
          </p>
          <ul className="list-disc ml-5 text-sm text-muted-foreground space-y-1">
            <li>Auth: NextAuth（GitHub OAuth）</li>
            <li>UI: shadcn/ui + Tailwind</li>
            <li>Toast: @/hooks/use-toast</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
