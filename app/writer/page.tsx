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
      toast.error("蜈･蜉帙・8譁・ｭ嶺ｻ･荳翫↓縺励※縺上□縺輔＞・医せ繝翫ャ繝励す繝ｧ繝・ヨ蜑肴署・・);
      return;
    }

    // 譌｢蟄倥せ繝医Μ繝ｼ繝繧貞●豁｢
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setResult("");
    setModel(undefined);
    setMock(undefined);
    setIsStreaming(true);
    toast.loading("繧ｹ繝医Μ繝ｼ繝溘Φ繧ｰ髢句ｧ・..", { id: "writer" });

    try {
      // 1st: /api/writer/stream・・SE/Chunk・峨ｒ譛溷ｾ・
      let res = await fetch("/api/writer/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ prompt: trimmed, language }),
        signal: abortRef.current.signal,
      });

      // 繝輔か繝ｼ繝ｫ繝舌ャ繧ｯ: 404/405/500 遲峨↑繧・/api/writer 繧貞腰逋ｺ蜻ｼ縺ｳ蜃ｺ縺・
      if (!res.ok && res.status !== 200) {
        // JSON API 繝輔か繝ｼ繝ｫ繝舌ャ繧ｯ
        const res2 = await fetch("/api/writer", {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify({ prompt: trimmed, language }),
          signal: abortRef.current.signal,
        });
        if (!res2.ok) {
          const msg = await res2.text();
          throw new Error(`/api/writer: ${res2.status} ${res2.statusText} 窶・${msg}`);
        }
        const payload = await res2.json().catch(async () => ({ text: await res2.text() }));
        const text =
          typeof payload?.text === "string" && payload.text.length > 0
            ? payload.text
            : JSON.stringify(payload, null, 2);
        setResult(text);
        setModel(typeof payload?.model === "string" ? payload.model : undefined);
        setMock(typeof payload?.mock === "boolean" ? payload.mock : undefined);
        toast.success("繝輔か繝ｼ繝ｫ繝舌ャ繧ｯ縺ｧ螳御ｺ・ｼ・api/writer・・, { id: "writer" });
        return;
      }

      // 繝ｬ繧ｹ繝昴Φ繧ｹ繝倥ャ繝縺ｫ model 遲峨′縺ゅｌ縺ｰ諡ｾ縺・
      const hdrModel = res.headers.get("x-model") || res.headers.get("X-Model") || undefined;
      if (hdrModel) setModel(hdrModel);

      const contentType = res.headers.get("content-type") || "";

      // 騾先ｬ｡隱ｭ縺ｿ蜿悶ｊ
      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error("ReadableStream 縺悟茜逕ｨ縺ｧ縺阪∪縺帙ｓ");
      }

      const decoder = new TextDecoder();
      let buffered = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });

        // SSE 蠖｢蠑擾ｼ・data:` 陦鯉ｼ峨↓繧らｴ逶ｴ縺ｪ繝・く繧ｹ繝医↓繧ょｯｾ蠢・
        buffered += chunk;

        // 陦悟腰菴阪〒蜃ｦ逅・
        const lines = buffered.split(/\r?\n/);
        buffered = lines.pop() ?? ""; // 譛蠕後・譛ｪ螳後・繝舌ャ繝輔ぃ縺ｫ謌ｻ縺・

        for (const line of lines) {
          if (!line) continue;

          // SSE縺ｮ繧ｳ繝｡繝ｳ繝・keepalive
          if (line.startsWith(":")) continue;

          if (line.startsWith("data:")) {
            const data = line.replace(/^data:\s?/, "");
            // JSON繝ｩ繧､繝ｳ { "text": "...", "model": "...", "mock": true } 縺ｫ繧ょｯｾ蠢・
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
              // 邏縺ｮ繝・く繧ｹ繝・
              setResult((prev) => prev + data);
            }
          } else {
            // 髱朶SE・育ｴ斐ユ繧ｭ繧ｹ繝・NDJSON遲会ｼ・
            // NDJSON 縺ｮ蝣ｴ蜷医・ JSON 縺ｪ繧・text 繧呈鏡縺・
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

      toast.success("繧ｹ繝医Μ繝ｼ繝溘Φ繧ｰ螳御ｺ・, { id: "writer" });
    } catch (err: any) {
      if (err?.name === "AbortError") {
        toast.message("繧ｹ繝医Μ繝ｼ繝溘Φ繧ｰ繧貞●豁｢縺励∪縺励◆", { id: "writer" });
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
          <CardTitle>Writer・・tep 4/4・壹せ繝医Μ繝ｼ繝溘Φ繧ｰ UI・・/CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="prompt">蜈･蜉幢ｼ・譁・ｭ嶺ｻ･荳奇ｼ・/Label>
              <Textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="萓具ｼ画丼縺ｮ譁ｰ菴懊ル繝・ヨ縺ｮ鬲・鴨繧偵・C繧ｵ繧､繝亥髄縺代↓邏ｹ莉九＠縺ｦ縺上□縺輔＞縲・
                minLength={8}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="language">險隱槭さ繝ｼ繝・/Label>
              <Input
                id="language"
                value={language}
                onChange={(e) => setLanguage((e.target.value as Lang) || "ja")}
                placeholder="ja 縺ｾ縺溘・ en"
              />
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={isStreaming}>
                {isStreaming ? "驟堺ｿ｡荳ｭ窶ｦ" : "逕滓・・医せ繝医Μ繝ｼ繝・・}
              </Button>
              <Button type="button" variant="destructive" onClick={handleStop} disabled={!isStreaming}>
                蛛懈ｭ｢
              </Button>
              <Button type="button" variant="secondary" onClick={handleClear} disabled={isStreaming}>
                繧ｯ繝ｪ繧｢
              </Button>
            </div>
          </form>

          <Separator />

          <div className="space-y-2">
            <Label>邨先棡・医Μ繧｢繝ｫ繧ｿ繧､繝・・/Label>
            <Card className="bg-muted/30">
              <CardContent className="py-4">
                {(model || mock !== undefined) && (
                  <div className="mb-2 text-sm text-muted-foreground">
                    {model ? `model: ${model}` : ""}
                    {mock !== undefined ? `  mock: ${mock}` : ""}
                  </div>
                )}
                <pre className="whitespace-pre-wrap text-sm leading-6 min-h-[120px]">
                  {result || "・医∪縺邨先棡縺ｯ縺ゅｊ縺ｾ縺帙ｓ・・}
                </pre>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

