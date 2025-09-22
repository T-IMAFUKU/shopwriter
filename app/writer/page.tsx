"use client";

import * as React from "react";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";

type WriterMeta = {
  style?: string;
  tone?: string;
  locale?: string;
};

type WriterResult = {
  ok: boolean;
  data?: {
    meta?: WriterMeta;
    text?: string;
  };
  error?: { message?: string };
};

export default function WriterPage() {
  const [prompt, setPrompt] = useState("新商品の紹介文を、要点を3つにまとめて作成してください。");
  const [mode, setMode] = useState("product_card");
  const [tone, setTone] = useState("friendly");   // 仕様：既定 friendly
  const [locale, setLocale] = useState("ja");     // 仕様：既定 ja
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("");

  async function runWriter() {
    if (!prompt.trim()) {
      toast.error("プロンプトを入力してください。", { id: "writer" });
      return;
    }

    setLoading(true);
    setResult("");

    try {
      const res = await fetch("/api/writer", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          mode,
          input: { prompt },
          options: { tone, locale },
        }),
      });

      const isJSON = res.headers.get("content-type")?.includes("application/json");
      const data: WriterResult = isJSON ? await res.json().catch(() => ({ ok: false })) : { ok: false };

      if (!res.ok || !data?.ok) {
        const msg = data?.error?.message ?? `HTTP ${res.status}`;
        toast.error(`生成に失敗しました: ${msg}`, { id: "writer" });
        return;
      }

      const text = data?.data?.text ?? "";
      setResult(text);

      const meta = data?.data?.meta ?? {};
      toast.success("生成に成功しました", {
        id: "writer",
        description: `style=${meta.style ?? "-"}, tone=${meta.tone ?? "-"}, locale=${meta.locale ?? "-"}`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`ネットワークエラー: ${msg}`, { id: "writer" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container mx-auto max-w-3xl px-4 py-8 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Writer — 生成テスト</h1>
        <p className="text-sm text-muted-foreground">
          /api/writer を呼び出してサンプル文面を生成します（既定: tone=friendly / locale=ja）。
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>入力</CardTitle>
          <CardDescription>プロンプトとオプションを設定して実行します。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="mode">スタイル（mode）</Label>
              <Input
                id="mode"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                placeholder="例）product_card"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tone">トーン（tone）</Label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger id="tone" aria-label="tone">
                  <SelectValue placeholder="選択…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="friendly">friendly（推奨）</SelectItem>
                  <SelectItem value="neutral">neutral</SelectItem>
                  <SelectItem value="professional">professional</SelectItem>
                  <SelectItem value="casual">casual</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="locale">ロケール（locale）</Label>
              <Select value={locale} onValueChange={setLocale}>
                <SelectTrigger id="locale" aria-label="locale">
                  <SelectValue placeholder="選択…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ja">ja（推奨）</SelectItem>
                  <SelectItem value="ja-JP">ja-JP</SelectItem>
                  <SelectItem value="en">en</SelectItem>
                  <SelectItem value="en-US">en-US</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="prompt">プロンプト</Label>
            <Textarea
              id="prompt"
              rows={6}
              placeholder="出力してほしい内容を入力…"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              aria-describedby="prompt-help"
            />
            <p id="prompt-help" className="text-xs text-muted-foreground">
              例）新商品の特徴（素材・サイズ・使い方など）を要点で盛り込み、最後にCTAを1行入れてください。
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex items-center justify-between gap-3">
          <Button type="button" onClick={runWriter} disabled={loading}>
            {loading ? "生成中…" : "生成する"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={loading}
            onClick={() => {
              setPrompt("");
              setResult("");
              toast.message("入力をクリアしました");
            }}
          >
            クリア
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>出力</CardTitle>
          <CardDescription>生成結果の本文とメタ情報を確認できます。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-xs text-muted-foreground">
            生成後、右上トーストに style / tone / locale が表示されます。
          </div>
          <pre className="min-h-40 whitespace-pre-wrap rounded-lg border bg-muted p-3 text-sm">
            {result || "（まだ生成は実行されていません）"}
          </pre>
        </CardContent>
      </Card>
    </main>
  );
}
