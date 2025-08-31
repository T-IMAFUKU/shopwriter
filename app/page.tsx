"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

export default function Page() {
  const { toast } = useToast();

  const onClickTry = () => {
    toast("Writer を開きます。");
  };

  return (
    <div className="container py-12">
      {/* Hero */}
      <section className="mx-auto max-w-4xl text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          商品説明文、もう悩まない。
        </h1>
        <p className="mt-4 text-muted-foreground">
          ShopWriterは、AIで商品ページのテキストを一瞬で作成。トーンも読者も自由に。
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            href="/writer"
            onClick={onClickTry}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            いますぐ試す
          </Link>
          <a
            href="#features"
            className="inline-flex h-10 items-center justify-center rounded-md border px-6 text-sm font-medium hover:bg-accent"
          >
            機能を見る
          </a>
        </div>
      </section>

      <Separator className="my-12" />

      {/* 3 Cards */}
      <section id="features" className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>テンプレ & トーン</CardTitle>
            <CardDescription>用途に合わせて雛形と口調を選択</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="tone">トーン例</Label>
              <Input id="tone" placeholder="例: 丁寧 / カジュアル / 専門的" />
            </div>
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>読者ターゲット</CardTitle>
            <CardDescription>届けたい相手に刺さる表現に</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="aud">想定読者</Label>
              <Input id="aud" placeholder="例: 20代女性 / 家電初心者 など" />
            </div>
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>即時プレビュー</CardTitle>
            <CardDescription>生成結果をその場で確認</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="prod">商品名</Label>
              <Input id="prod" placeholder="例: 充電式ハンディファン" />
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/writer"
                onClick={onClickTry}
                className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Writer を開く
              </Link>
              <button
                onClick={() => toast("サンプル生成（ダミー）")}
                className="inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-accent"
              >
                サンプル生成
              </button>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
