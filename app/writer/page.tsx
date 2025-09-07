"use client";

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

type WriterRequest = {
  productName: string;
  audience: string;
  template: string;
  tone: string;
  keywords: string[];
  language: string;
};

type WriterResponse = {
  ok: boolean;
  mock?: boolean;
  model?: string;
  text?: string;
  received?: WriterRequest;
  [k: string]: unknown;
};

export default function Page() {
  // 入力状態
  const [productName, setProductName] = useState("ShopWriter Premium");
  const [audience, setAudience] = useState("EC担当者");
  const [template, setTemplate] = useState("EC");
  const [tone, setTone] = useState("カジュアル");
  const [keywordsCsv, setKeywordsCsv] = useState("SEO, CVR, スピード");
  const [language, setLanguage] = useState("ja");

  // 通信状態
  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState<WriterResponse | null>(null);

  const keywords = useMemo(
    () =>
      keywordsCsv
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    [keywordsCsv]
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setResp(null);

    const body: WriterRequest = {
      productName,
      audience,
      template,
      tone,
      keywords,
      language,
    };

    const t = toast.loading("生成中… /api/writer に送信しています");

    try {
      const r = await fetch("/api/writer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify(body),
        cache: "no-store",
      });

      const data: WriterResponse = await r.json();

      if (!r.ok) {
        throw new Error(`HTTP ${r.status} ${r.statusText}`);
      }

      setResp(data);
      toast.success("生成完了", {
        id: t,
        description: "モック応答の日本語テキストを表示します。",
      });
    } catch (err: any) {
      const msg = err?.message ?? "送信に失敗しました。";
      toast.error("エラー", { id: t, description: msg });
    } finally {
      setLoading(false);
    }
  }

  function handleClear() {
    setResp(null);
    toast("クリアしました");
  }

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Writer — モックAPI接続</h1>
        <p className="text-sm text-muted-foreground">
          フォーム送信 → <code>/api/writer</code>（POST） → 応答テキストを表示します。
        </p>
      </header>

      <Card className="rounded-2xl">
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="productName">製品名 (productName)</Label>
                <Input
                  id="productName"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="例: ShopWriter Premium"
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="audience">想定読者 (audience)</Label>
                <Input
                  id="audience"
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  placeholder="例: EC担当者"
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="template">テンプレ (template)</Label>
                <Input
                  id="template"
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  placeholder="例: EC / 不動産 / SaaS"
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="tone">トーン (tone)</Label>
                <Input
                  id="tone"
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  placeholder="例: カジュアル / フォーマル"
                  required
                />
              </div>

              <div className="md:col-span-2 grid gap-2">
                <Label htmlFor="keywords">キーワードCSV (keywords)</Label>
                <Input
                  id="keywords"
                  value={keywordsCsv}
                  onChange={(e) => setKeywordsCsv(e.target.value)}
                  placeholder="例: SEO, CVR, スピード"
                />
                <p className="text-xs text-muted-foreground">
                  カンマ区切りで入力（例: <code>SEO, CVR, スピード</code>）
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="language">言語 (language)</Label>
                <Input
                  id="language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  placeholder="例: ja / en"
                  required
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={loading}>
                {loading ? "送信中…" : "送信"}
              </Button>
              <Button type="button" variant="outline" onClick={handleClear} disabled={loading}>
                クリア
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">レスポンス</h2>

        {!resp && (
          <p className="text-sm text-muted-foreground">
            送信するとここに結果が表示されます。
          </p>
        )}

        {resp && (
          <Card>
            <CardContent className="p-4 space-y-4">
              {"text" in resp && resp.text && (
                <pre className="whitespace-pre-wrap text-sm leading-6">
                  {resp.text}
                </pre>
              )}
              <details>
                <summary className="cursor-pointer text-sm">JSON（詳細を開く）</summary>
                <pre className="mt-2 text-xs overflow-x-auto">
                  {JSON.stringify(resp, null, 2)}
                </pre>
              </details>
            </CardContent>
          </Card>
        )}
      </section>
    </main>
  );
}
