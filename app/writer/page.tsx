// FILE: app/writer/page.tsx
"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
// Tabs は shadcn/ui 前提（未導入なら Tabs を省いて単一画面にしてもOK）
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";

const WriterInputSchema = z.object({
  productName: z.string().min(1, "商品名は必須です"),
  audience: z.string().min(1, "想定読者は必須です"),
  template: z.string().min(1, "テンプレートは必須です"),
  tone: z.string().min(1, "トーンは必須です"),
  keywords: z.string().optional(), // カンマ区切り入力（UI→APIで配列化）
  language: z.string().min(2).max(5).default("ja"),
});
type WriterInput = z.infer<typeof WriterInputSchema>;

export default function Page() {
  const [activeTab, setActiveTab] = React.useState<"input" | "output">("input");
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<string>("（ここに出力が表示されます）");

  const form = useForm<WriterInput>({
    resolver: zodResolver(WriterInputSchema),
    defaultValues: {
      productName: "",
      audience: "",
      template: "EC",
      tone: "カジュアル",
      keywords: "SEO,CVR,スピード",
      language: "ja",
    },
    mode: "onTouched",
  });

  const onSubmit = async (values: WriterInput) => {
    try {
      setLoading(true);
      // keywords を配列へ
      const payload = {
        ...values,
        keywords: (values.keywords ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      };

      const res = await fetch("/api/writer", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json();
      setResult(String(data.text ?? "（text がありません）"));
      setActiveTab("output");
    } catch (e: any) {
      setResult(`エラー：${e?.message ?? e}`);
      setActiveTab("output");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="container mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Writer（APIモック → 出力表示）</h1>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="mb-6">
          <TabsTrigger value="input">入力</TabsTrigger>
          <TabsTrigger value="output">出力</TabsTrigger>
        </TabsList>

        <TabsContent value="input" className="space-y-6">
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit(onSubmit)}
            noValidate
          >
            <div className="grid gap-2">
              <Label htmlFor="productName">商品名</Label>
              <Input id="productName" placeholder="例）ShopWriter Premium" {...form.register("productName")} />
              {form.formState.errors.productName && (
                <p className="text-sm text-red-600">
                  {form.formState.errors.productName.message}
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="audience">想定読者</Label>
              <Input id="audience" placeholder="例）EC担当者" {...form.register("audience")} />
              {form.formState.errors.audience && (
                <p className="text-sm text-red-600">
                  {form.formState.errors.audience.message}
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="template">テンプレート</Label>
              <Input id="template" placeholder="例）EC" {...form.register("template")} />
              {form.formState.errors.template && (
                <p className="text-sm text-red-600">
                  {form.formState.errors.template.message}
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="tone">トーン</Label>
              <Input id="tone" placeholder="例）カジュアル" {...form.register("tone")} />
              {form.formState.errors.tone && (
                <p className="text-sm text-red-600">
                  {form.formState.errors.tone.message}
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="keywords">キーワード（カンマ区切り）</Label>
              <Input id="keywords" placeholder="例）SEO,CVR,スピード" {...form.register("keywords")} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="language">言語</Label>
              <Input id="language" placeholder="ja" {...form.register("language")} />
              {form.formState.errors.language && (
                <p className="text-sm text-red-600">
                  {form.formState.errors.language.message}
                </p>
              )}
            </div>

            <div className="pt-2">
              <Button type="submit" disabled={loading}>
                {loading ? "生成中..." : "生成する"}
              </Button>
            </div>
          </form>
        </TabsContent>

        <TabsContent value="output">
          <div className="grid gap-2">
            <Label>出力</Label>
            <pre className="whitespace-pre-wrap rounded-md border p-4 min-h-[200px]">
              {result}
            </pre>
          </div>
        </TabsContent>
      </Tabs>
    </main>
  );
}
