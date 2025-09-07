"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

type FormState = {
  productName: string;
  audience: string;
  template: string;
  tone: string;
  keywords: string;
  language: string;
};

export default function Page() {
  const [form, setForm] = React.useState<FormState>({
    productName: "",
    audience: "",
    template: "EC",
    tone: "カジュアル",
    keywords: "",
    language: "ja",
  });

  const [streaming, setStreaming] = React.useState<boolean>(true);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [output, setOutput] = React.useState<string>("");
  const abortRef = React.useRef<AbortController | null>(null);

  const handleChange =
    (key: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((s) => ({ ...s, [key]: e.target.value }));
    };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setOutput("");
    setLoading(true);

    const body = {
      productName: form.productName,
      audience: form.audience,
      template: form.template,
      tone: form.tone,
      keywords: form.keywords
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      language: form.language || "ja",
    };

    try {
      if (streaming) {
        await runStreaming(body);
      } else {
        await runNormal(body);
      }
    } catch (err) {
      setOutput(
        `**エラー**: ${(err as Error)?.message ?? "実行中に問題が発生しました"}`
      );
    } finally {
      setLoading(false);
    }
  };

  const runNormal = async (payload: any) => {
    const res = await fetch("/api/writer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `HTTP ${res.status} ${res.statusText}${text ? `\n${text}` : ""}`
      );
    }

    // 期待形式: { text: string, ... } を想定。fallbackで text/plain も吸収
    let md = "";
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await res.json();
      md =
        data?.text ??
        data?.markdown ??
        JSON.stringify(data, null, 2 /* 予防的フォールバック */);
    } else {
      md = await res.text();
    }

    setOutput(md || "_（出力が空でした）_");
  };

  const runStreaming = async (payload: any) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const res = await fetch("/api/writer/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: abortRef.current.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `HTTP ${res.status} ${res.statusText}${text ? `\n${text}` : ""}`
      );
    }

    if (!res.body) {
      throw new Error("ReadableStream がありません（res.body === null）");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let done = false;

    while (!done) {
      const { value, done: doneReading } = await reader.read();
      done = doneReading;
      if (value) {
        const chunk = decoder.decode(value, { stream: !doneReading });
        setOutput((prev) => prev + chunk);
      }
    }
  };

  const handleAbort = () => {
    abortRef.current?.abort();
  };

  const handleClear = () => {
    setOutput("");
  };

  return (
    <main className="container mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-2">Writer（通常/ストリーミング切替）</h1>
      <p className="text-sm text-muted-foreground mb-4">
        /api/writer（JSON） と /api/writer/stream（逐次出力）を UI から切替
      </p>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左ペイン：入力フォーム */}
        <section className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="productName">商品名 / サービス名</Label>
              <Input
                id="productName"
                value={form.productName}
                onChange={handleChange("productName")}
                placeholder="ShopWriter Premium"
                required
              />
            </div>
            <div>
              <Label htmlFor="audience">想定読者</Label>
              <Input
                id="audience"
                value={form.audience}
                onChange={handleChange("audience")}
                placeholder="EC担当者"
              />
            </div>
            <div>
              <Label htmlFor="template">テンプレート</Label>
              <Input
                id="template"
                value={form.template}
                onChange={handleChange("template")}
                placeholder="EC"
              />
            </div>
            <div>
              <Label htmlFor="tone">トーン</Label>
              <Input
                id="tone"
                value={form.tone}
                onChange={handleChange("tone")}
                placeholder="カジュアル / フォーマル など"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="keywords">キーワード（カンマ区切り）</Label>
            <Input
              id="keywords"
              value={form.keywords}
              onChange={handleChange("keywords")}
              placeholder="SEO, CVR, スピード"
            />
          </div>

          <div>
            <Label htmlFor="language">出力言語</Label>
            <Input
              id="language"
              value={form.language}
              onChange={handleChange("language")}
              placeholder="ja / en など"
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Switch
                id="streaming"
                checked={streaming}
                onCheckedChange={setStreaming}
              />
              <Label htmlFor="streaming" className="cursor-pointer">
                ストリーミング生成を有効にする
              </Label>
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={handleClear}>
                クリア
              </Button>
              {loading ? (
                <Button type="button" variant="destructive" onClick={handleAbort}>
                  中止
                </Button>
              ) : (
                <Button type="submit">生成</Button>
              )}
            </div>
          </div>
        </section>

        {/* 右ペイン：逐次描画ビュー */}
        <section className="min-h-[420px] rounded-lg border p-4 overflow-auto bg-background">
          <div className="text-xs text-muted-foreground mb-2">
            {streaming ? "ストリーミング表示中…" : "通常表示"}
          </div>
          <div className="prose prose-sm max-w-none">
            {output ? (
              <ReactMarkdown>{output}</ReactMarkdown>
            ) : (
              <p className="text-sm text-muted-foreground">
                ここに Markdown 出力が段階的に表示されます…
              </p>
            )}
          </div>
        </section>
      </form>
    </main>
  );
}
