"use client";

import * as React from "react";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";

type Lang = "ja" | "en";

export default function Page() {
  const [prompt, setPrompt] = useState("");
  const [language, setLanguage] = useState<Lang>("ja");
  const [result, setResult] = useState("");
  const [model, setModel] = useState<string | undefined>(undefined);
  const [mock, setMock] = useState<boolean | undefined>(undefined);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const trimmed = prompt.trim();
    if (trimmed.length < 8) {
      toast.error("入力は8文字以上にしてください（スナップショット前提）");
      return;
    }

    // 既存ストリームを停止
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setResult("");
    setModel(undefined);
    setMock(undefined);
    setIsStreaming(true);
    toast.loading("ストリーミング開始...", { id: "writer" });

    try {
      // 1st: /api/writer/stream（SSE/Chunk）を期待
      let res = await fetch("/api/writer/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ prompt: trimmed, language }),
        signal: abortRef.current.signal,
      });

      // フォールバック: 404/405/500 等なら /api/writer を単発呼び出し
      if (!res.ok && res.status !== 200) {
        // JSON API フォールバック
        const res2 = await fetch("/api/writer", {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify({ prompt: trimmed, language }),
          signal: abortRef.current.signal,
        });
        if (!res2.ok) {
          const msg = await res2.text();
          throw new Error(`/api/writer: ${res2.status} ${res2.statusText} — ${msg}`);
        }
        const payload = await res2.json().catch(async () => ({ text: await res2.text() }));
        const text =
          typeof payload?.text === "string" && payload.text.length > 0
            ? payload.text
            : JSON.stringify(payload, null, 2);
        setResult(text);
        setModel(typeof payload?.model === "string" ? payload.model : undefined);
        setMock(typeof payload?.mock === "boolean" ? payload.mock : undefined);
        toast.success("フォールバックで完了（/api/writer）", { id: "writer" });
        return;
      }

      // レスポンスヘッダに model 等があれば拾う
      const hdrModel = res.headers.get("x-model") || res.headers.get("X-Model") || undefined;
      if (hdrModel) setModel(hdrModel);

      const contentType = res.headers.get("content-type") || "";

      // 逐次読み取り
      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error("ReadableStream が利用できません");
      }

      const decoder = new TextDecoder();
      let buffered = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });

        // SSE 形式（`data:` 行）にも素直なテキストにも対応
        buffered += chunk;

        // 行単位で処理
        const lines = buffered.split(/\r?\n/);
        buffered = lines.pop() ?? ""; // 最後の未完はバッファに戻す

        for (const line of lines) {
          if (!line) continue;

          // SSEのコメント/keepalive
          if (line.startsWith(":")) continue;

          if (line.startsWith("data:")) {
            const data = line.replace(/^data:\s?/, "");
            // JSONライン { "text": "...", "model": "...", "mock": true } にも対応
            try {
              const obj = JSON.parse(data);
              if (typeof obj?.text === "string") {
                setResult((prev) => prev + obj.text);
              } else if (typeof obj === "string") {
                setResult((prev) => prev + obj);
              } else {
                setResult((prev) => prev + JSON.stringify(obj));
              }
              if (typeof obj?.model === "string") setModel(obj.model);
              if (typeof obj?.mock === "boolean") setMock(obj.mock);
            } catch {
              // 素のテキスト
              setResult((prev) => prev + data);
            }
          } else {
            // 非SSE（純テキスト/NDJSON等）
            // NDJSON の場合は JSON なら text を拾う
            try {
              const obj = JSON.parse(line);
              if (typeof obj?.text === "string") setResult((prev) => prev + obj.text);
              else setResult((prev) => prev + JSON.stringify(obj));
            } catch {
              setResult((prev) => prev + line);
            }
          }
        }
      }

      toast.success("ストリーミング完了", { id: "writer" });
    } catch (err: any) {
      if (err?.name === "AbortError") {
        toast.message("ストリーミングを停止しました", { id: "writer" });
      } else {
        console.error(err);
        toast.error(String(err?.message ?? err), { id: "writer" });
      }
    } finally {
      setIsStreaming(false);
    }
  }

  function handleStop() {
    abortRef.current?.abort();
    setIsStreaming(false);
  }

  function handleClear() {
    setPrompt("");
    setResult("");
    setModel(undefined);
    setMock(undefined);
  }

  return (
    <main className="container mx-auto max-w-3xl px-4 py-8 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Writer（Step 4/4：ストリーミング UI）</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="prompt">入力（8文字以上）</Label>
              <Textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="例）春の新作ニットの魅力を、ECサイト向けに紹介してください。"
                minLength={8}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="language">言語コード</Label>
              <Input
                id="language"
                value={language}
                onChange={(e) => setLanguage((e.target.value as Lang) || "ja")}
                placeholder="ja または en"
              />
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={isStreaming}>
                {isStreaming ? "配信中…" : "生成（ストリーム）"}
              </Button>
              <Button type="button" variant="destructive" onClick={handleStop} disabled={!isStreaming}>
                停止
              </Button>
              <Button type="button" variant="secondary" onClick={handleClear} disabled={isStreaming}>
                クリア
              </Button>
            </div>
          </form>

          <Separator />

          <div className="space-y-2">
            <Label>結果（リアルタイム）</Label>
            <Card className="bg-muted/30">
              <CardContent className="py-4">
                {(model || mock !== undefined) && (
                  <div className="mb-2 text-sm text-muted-foreground">
                    {model ? `model: ${model}` : ""}
                    {mock !== undefined ? `  mock: ${mock}` : ""}
                  </div>
                )}
                <pre className="whitespace-pre-wrap text-sm leading-6 min-h-[120px]">
                  {result || "（まだ結果はありません）"}
                </pre>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
