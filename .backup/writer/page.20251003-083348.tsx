"use client";`r`nexport const dynamic = 'force-dynamic';

import * as React from "react";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  notifyInfo,
  notifySaved,
  notifyError,
} from "@/src/lib/notify";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
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

type WriterSuccess = {
  ok: true;
  provider: string;
  model: string;
  text: string;
};

type WriterError = {
  ok: false;
  code: string;
  message: string;
  details?: unknown;
};

type TemplateItem = {
  id: string;
  title: string;
  body?: string | null;
};

export default function WriterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [prompt, setPrompt] = useState(
    "これは全世界に向けた画期的なシステムです。"
  );
  const [mode, setMode] = useState("product_card");
  const [tone, setTone] = useState("friendly");
  const [locale, setLocale] = useState("ja");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("");

  // --- テンプレ選択 ---
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | undefined>(
    searchParams.get("templateId") ?? undefined
  );

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/templates", { method: "GET", cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const arr: any[] = Array.isArray(data) ? data : data?.data ?? data?.items ?? [];
        setTemplates(arr.map((t) => ({
          id: String(t.id ?? ""),
          title: String(t.title ?? ""),
          body: t.body ?? "",
        })));
      } catch (e: any) {
        notifyError("テンプレート取得に失敗しました", e?.message ?? "Fetch error");
      }
    })();
  }, []);

  const handleTemplateChange = (id: string) => {
    setSelectedTemplate(id);
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    if (id) {
      params.set("templateId", id);
    } else {
      params.delete("templateId");
    }
    router.push(`/writer?${params.toString()}`);
    notifyInfo("テンプレートを選択しました", id);
  };

  async function runWriter() {
    if (!prompt.trim()) {
      notifyError("入力エラー", "プロンプトを入力してください");
      return;
    }

    setLoading(true);
    setResult("");

    const system = [
      "You are ShopWriter, a helpful assistant that writes concise, high-quality Japanese e-commerce copy.",
      `Tone: ${tone}`,
      `Locale: ${locale}`,
      `Style: ${mode}`,
      selectedTemplate ? `Template: ${selectedTemplate}` : "",
    ].join(" ");

    try {
      const res = await fetch("/api/writer", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          provider: "openai",
          prompt,
          system,
        }),
      });

      const ct = res.headers.get("content-type") ?? "";
      const looksJson = ct.includes("application/json");

      if (!res.ok) {
        let message = `${res.status} ${res.statusText}`.trim();
        try {
          if (looksJson) {
            const data = (await res.json()) as Partial<WriterError>;
            message = data?.message ?? message;
          } else {
            message = (await res.text()) || message;
          }
        } catch {}
        notifyError("生成に失敗しました", message);
        return;
      }

      if (looksJson) {
        const data = (await res.json()) as WriterSuccess | WriterError;
        if ("ok" in data && data.ok === true && "text" in data) {
          setResult(data.text ?? "");
          notifySaved(
            `provider=${data.provider}, model=${data.model}, tone=${tone}, locale=${locale}, style=${mode}, templateId=${selectedTemplate ?? "-"}`
          );
          return;
        }
        notifyError("生成に失敗しました", `Unexpected payload: ${JSON.stringify(data).slice(0, 300)}`);
        return;
      }

      const txt = await res.text();
      setResult(txt || "(空のレスポンス)");
      notifyInfo("非JSONレスポンスを受信しました", "暫定表示（右上・約2600ms）");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      notifyError("ネットワークエラー", msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container mx-auto max-w-3xl px-4 py-8 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Writer — 生成テスト</h1>
        <p className="text-sm text-muted-foreground">
          /api/writer に <code>prompt</code> / <code>system</code> を渡します
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
              <Label htmlFor="mode">スタイル</Label>
              <Input
                id="mode"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                placeholder="例）product_card"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tone">トーン</Label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger id="tone" aria-label="tone">
                  <SelectValue placeholder="選択…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="friendly">friendly</SelectItem>
                  <SelectItem value="neutral">neutral</SelectItem>
                  <SelectItem value="professional">professional</SelectItem>
                  <SelectItem value="casual">casual</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="locale">ロケール</Label>
              <Select value={locale} onValueChange={setLocale}>
                <SelectTrigger id="locale" aria-label="locale">
                  <SelectValue placeholder="選択…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ja">ja</SelectItem>
                  <SelectItem value="ja-JP">ja-JP</SelectItem>
                  <SelectItem value="en">en</SelectItem>
                  <SelectItem value="en-US">en-US</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="template">テンプレート</Label>
              <Select value={selectedTemplate} onValueChange={handleTemplateChange}>
                <SelectTrigger id="template" aria-label="template">
                  <SelectValue placeholder="選択…" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((tpl) => (
                    <SelectItem key={tpl.id} value={tpl.id}>
                      {tpl.title}
                    </SelectItem>
                  ))}
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
            />
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
              notifyInfo("入力をクリアしました");
            }}
          >
            クリア
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>出力</CardTitle>
          <CardDescription>生成結果の本文を確認できます。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <pre className="min-h-40 whitespace-pre-wrap rounded-lg border bg-muted p-3 text-sm">
            {result || "（まだ生成は実行されていません）"}
          </pre>
        </CardContent>
      </Card>
    </main>
  );
}
