"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

/**
 * Writer ClientPage（診断強制ON版）
 * - ヘッダー直下に「青バナー」を常時表示：Hotkey/Loading/Copy/Scroll の発火回数を可視化
 * - Ctrl/⌘+Enter：document 監視 + ルート onKeyDownCapture の二重化（IME中は除外）
 * - Skeleton：最短 600ms 表示（STUBでも見える）
 * - 自動スクロール：出力更新後に確実に scrollIntoView
 * - コピー：例外時も「コピー済み」を一度出す（Clipboard 不許可の切り分けのため）
 * - 既存E2E互換：data-testid="editor|save-draft|clear-draft" は維持
 */

const STORAGE_KEY = "writer_draft_text_v1";

type WriterOk = {
  ok: true;
  data: { text: string; meta: { style: string; tone: string; locale: string } };
  output: string;
};
type WriterErr = { ok: false; error: string; details?: string };
type WriterResp = WriterOk | WriterErr;

export default function ClientPage() {
  // 旧来Draft（テスト互換）
  const [text, setText] = useState("");
  const [savedAt, setSavedAt] = useState("");

  // 入力
  const [product, setProduct] = useState("ShopWriter");
  const [purpose, setPurpose] = useState("文章生成");
  const [feature, setFeature] = useState("爆速で最適な文章");
  const [target, setTarget] = useState("ユーザー");
  const [tone, setTone] = useState("親しみやすい");
  const [template, setTemplate] = useState<"lp" | "blog" | "ad">("lp");
  const [length, setLength] = useState<"short" | "medium" | "long">("medium");
  const [withCta, setWithCta] = useState(false);

  // 出力・状態
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  // 診断カウンタ（青バナーに表示）
  const [hotkeyCnt, setHotkeyCnt] = useState(0);
  const [loadCnt, setLoadCnt] = useState(0);
  const [copyCnt, setCopyCnt] = useState(0);
  const [scrollCnt, setScrollCnt] = useState(0);

  const outputRef = useRef<HTMLDivElement | null>(null);

  // 初回復元
  useEffect(() => {
    const load = () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const obj = JSON.parse(raw) as { text?: string; savedAt?: string };
        if (obj.text) setText(obj.text);
        if (obj.savedAt) setSavedAt(obj.savedAt);
      } catch {}
    };
    load();
    setTimeout(load, 500);
  }, []);

  // 保存
  const save = (val: string) => {
    try {
      const now = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ text: val, savedAt: now }));
      setSavedAt(now);
    } catch {}
  };

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);
    save(val);
  };
  const onManualSave = () => save(text);
  const onClear = () => {
    localStorage.removeItem(STORAGE_KEY);
    setText("");
    setSavedAt("");
  };

  // Prompt 組立
  const prompt = useMemo(() => {
    const lines = [
      `# プロダクト: ${product || "-"}`,
      `# 用途: ${purpose || "-"}`,
      `# 特徴: ${feature || "-"}`,
      `# ターゲット: ${target || "-"}`,
      `# トーン: ${tone || "friendly"}`,
      `# テンプレ: ${template} / 長さ: ${length} / CTA: ${withCta ? "あり" : "なし"}`,
      "",
      "## 出力要件",
      "- 日本語",
      "- 具体的・簡潔・販売導線を意識",
      "- 見出し→特長→CTA の順でセクション化",
      "",
      text ? "## 参考テキスト\n" + text : "",
    ];
    return lines.join("\n");
  }, [product, purpose, feature, target, tone, template, length, withCta, text]);

  // 生成（Skeleton >=600ms）
  const onGenerate = useCallback(async () => {
    if (loading) return;
    setLoadCnt((n) => n + 1);
    setLoading(true);
    setError("");
    setOutput("");

    const minSpin = new Promise((r) => setTimeout(r, 600));
    try {
      const resp = await fetch("/api/writer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "openai",
          model: "gpt-4o-mini",
          temperature: 0.7,
          system:
            "あなたは有能なECライターAIです。日本語で、簡潔かつ具体的に出力してください。",
          prompt,
        }),
      });
      const data = (await resp.json()) as WriterResp;
      if (!data.ok) {
        await minSpin;
        setError(data.error || "unexpected error");
        return;
      }
      const out = data.output ?? data.data?.text ?? "";
      await minSpin;
      setOutput(out);
    } catch (e: any) {
      await minSpin;
      setError(e?.message ?? "network error");
    } finally {
      setLoading(false);
    }
  }, [loading, prompt]);

  // 出力更新 → 自動スクロール
  useEffect(() => {
    if (!loading && output) {
      requestAnimationFrame(() => {
        outputRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        setScrollCnt((n) => n + 1);
      });
    }
  }, [loading, output]);

  // Ctrl/⌘+Enter（document）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const mod = isMac ? e.metaKey : e.ctrlKey;
      // @ts-ignore: IME中は除外
      if ((e as any).isComposing) return;
      if (mod && e.key === "Enter") {
        e.preventDefault();
        setHotkeyCnt((n) => n + 1);
        onGenerate();
      }
    };
    document.addEventListener("keydown", handler, { passive: false });
    return () => document.removeEventListener("keydown", handler);
  }, [onGenerate]);

  // ルート onKeyDownCapture（IMEフォーカス時の保険）
  const onKeyDownCapture: React.KeyboardEventHandler = (e) => {
    const isMac = navigator.platform.toLowerCase().includes("mac");
    const mod = isMac ? (e.metaKey as boolean) : (e.ctrlKey as boolean);
    // @ts-ignore
    if ((e as any).isComposing) return;
    if (mod && e.key === "Enter") {
      e.preventDefault();
      setHotkeyCnt((n) => n + 1);
      onGenerate();
    }
  };

  // コピー
  const onCopy = async () => {
    setCopyCnt((n) => n + 1);
    try {
      // 失敗しても UI は「コピー済み」を表示してユーザー操作が有効だったことを示す
      await navigator.clipboard.writeText(output || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const isStub = output.includes("【STUB出力】");

  return (
    <main className="mx-auto max-w-6xl p-6" onKeyDown={onKeyDownCapture}>
      {/* 固定診断バナー（この行が見えない=このClientPage.tsxが描画されていません） */}
      <div className="sticky top-0 z-50 -mx-6 mb-3 border-b bg-[#e8f1ff] px-3 py-2 text-[12px] text-[#0b3ba7]">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-medium">/writer — ClientPage.tsx 診断</span>
          <span>Hotkey:{hotkeyCnt}</span>
          <span>Loading:{loadCnt}</span>
          <span>Copy:{copyCnt}</span>
          <span>Scroll:{scrollCnt}</span>
          <span>STUB:{isStub ? "YES" : "NO"}</span>
        </div>
      </div>

      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold">Writer</h1>
          <p className="text-xs text-muted-foreground">
            最短3ステップで構成・話し方・トーンを指定し、出力まで。
          </p>
        </div>
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/help" className="text-muted-foreground hover:underline">ヘルプ</Link>
          <Link href="/guide/share" className="text-muted-foreground hover:underline">共有の使い方</Link>
        </nav>
      </div>

      {/* 2カラム：入力／出力 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 入力 */}
        <section className="rounded-xl border p-4">
          <h2 className="text-sm font-medium mb-3">
            入力（構成／話し方／トーンを最短指定） <span className="text-xs text-muted-foreground">(Ctrl/⌘+Enterで生成)</span>
          </h2>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">商品名</Label>
                <Input value={product} onChange={(e) => setProduct(e.target.value)} placeholder="例: ShopWriter" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">用途・目的</Label>
                <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="例: 文章生成" />
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">
                特徴・強み <span className="text-muted-foreground/60">(8文字以上推奨)</span>
              </Label>
              <Input value={feature} onChange={(e) => setFeature(e.target.value)} placeholder="例: 爆速で最適な文章" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">ターゲット</Label>
                <Input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="例: ユーザー" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">トーン</Label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                >
                  <option>親しみやすい</option>
                  <option>フォーマル</option>
                  <option>フレンドリー</option>
                  <option>カジュアル</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">テンプレ</Label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={template}
                  onChange={(e) => setTemplate(e.target.value as "lp" | "blog" | "ad")}
                >
                  <option value="lp">LP</option>
                  <option value="blog">Blog</option>
                  <option value="ad">AD</option>
                </select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">長さ</Label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={length}
                  onChange={(e) => setLength(e.target.value as "short" | "medium" | "long")}
                >
                  <option value="short">短い</option>
                  <option value="medium">普通</option>
                  <option value="long">長い</option>
                </select>
              </div>
              <div className="flex items-end">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4" checked={withCta} onChange={(e) => setWithCta(e.target.checked)} />
                  CTAを入れる
                </label>
              </div>
            </div>

            {/* 参考テキスト（旧来Draft互換） */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">参考テキスト（任意）</Label>
              <Textarea
                data-testid="editor"
                className="h-40 resize-vertical"
                placeholder="ここに商品情報や説明文を入力…"
                value={text}
                onChange={onChange}
              />
              <div className="mt-2 flex flex-wrap gap-3">
                <Button type="button" data-testid="save-draft" variant="secondary" onClick={onManualSave}>
                  下書きを保存
                </Button>
                <Button type="button" data-testid="clear-draft" variant="secondary" onClick={onClear}>
                  下書きを消去
                </Button>
                <span className="text-xs text-muted-foreground self-center">
                  {savedAt ? `最終保存: ${savedAt}` : "未保存"}
                </span>
              </div>
            </div>

            <div className="pt-1">
              <Button type="button" onClick={onGenerate} disabled={loading} variant="primary">
                {loading ? "生成中…" : "生成する"}
              </Button>
            </div>
          </div>
        </section>

        {/* 出力 */}
        <section className="rounded-xl border p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-medium">出力</h2>
            <div className="flex items-center gap-2">
              <Button type="button" onClick={onCopy} disabled={!output || loading} variant="secondary" size="sm">
                {copied ? "コピー済み" : "コピー"}
              </Button>
              <Button type="button" onClick={() => alert("共有カード：別タスクで実装予定")} variant="secondary" size="sm">
                共有カード
              </Button>
            </div>
          </div>

          <div className="text-xs text-muted-foreground mb-3">
            {isStub ? "STUBモード：外部APIを呼び出さず固定ロジックで応答しています。" : ""}
          </div>

          <div
            ref={outputRef}
            className="rounded-md border bg-white/50 p-3 min-h-[12rem] whitespace-pre-wrap text-sm"
          >
            {error ? (
              `【エラー】${error}`
            ) : loading ? (
              <div className="space-y-2 animate-pulse" aria-live="polite" aria-busy="true">
                <div className="h-4 w-2/3 bg-gray-200 rounded" />
                <div className="h-4 w-1/2 bg-gray-200 rounded" />
                <div className="h-4 w-5/6 bg-gray-200 rounded" />
                <div className="h-4 w-4/5 bg-gray-200 rounded" />
              </div>
            ) : output ? (
              output
            ) : (
              "生成結果がここに表示されます。"
            )}
          </div>
        </section>
      </div>

      {/* フッター */}
      <div className="mt-6 text-center text-xs text-muted-foreground">
        生成に満足しましたか？ プランをアップグレードして、共有上限・履歴保存・差分比較を解放できます。
      </div>
    </main>
  );
}

