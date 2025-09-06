"use client";

import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";

export default function HomePage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const onTry = async () => {
    setLoading(true);
    toast({
      title: "デモ開始",
      description: "ダミー入力で生成プロセスを体験できます（UIのみ）。",
    });
    setTimeout(() => setLoading(false), 800);
  };

  return (
    <main className="container mx-auto px-4 py-12">
      {/* HERO */}
      <section className="mx-auto max-w-4xl text-center">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">
          ShopWriter
          <span className="text-primary"> — 商品説明を、一瞬で。</span>
        </h1>
        <p className="mt-4 text-muted-foreground">
          Next.js + Prisma 構成のライティング支援SaaS。ヒーロー＋3カードの新トップページです。
        </p>

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button onClick={onTry} className="w-full sm:w-auto">無料で試す</Button>
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href="/api/auth/signin">GitHubでサインイン</Link>
          </Button>
        </div>

        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>すぐに書ける</CardTitle>
              <CardDescription>商品名と読者ターゲットから、下書きを自動生成。</CardDescription>
            </CardHeader>
            <CardContent>
              <Separator className="mb-4" />
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="name">商品名（例：速乾タオル）</Label>
                  <Input id="name" placeholder="商品名を入力" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="aud">想定読者</Label>
                  <Input id="aud" placeholder="例：忙しい社会人" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>テンプレ管理</CardTitle>
              <CardDescription>書式やトーンをテンプレ化し、量産を効率化。</CardDescription>
            </CardHeader>
            <CardContent>
              <Separator className="mb-4" />
              {loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  「無料で試す」を押すとトーストで開始通知。ローディングは Skeleton 表現。
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Next.js 15 + Prisma</CardTitle>
              <CardDescription>Neon(Postgres) と連携、Vercel に即デプロイ。</CardDescription>
            </CardHeader>
            <CardContent>
              <Separator className="mb-4" />
              <ul className="text-sm list-disc pl-5 space-y-1 text-muted-foreground">
                <li>Auth: NextAuth（GitHub OAuth）</li>
                <li>UI: shadcn/ui + Tailwind</li>
                <li>Toast: <code>@/hooks/use-toast</code></li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
