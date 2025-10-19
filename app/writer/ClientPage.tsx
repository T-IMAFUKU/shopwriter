// app/writer/ClientPage.tsx
"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AnimatePresence, motion } from "framer-motion";

/**
 * Writer ClientPage（原因特定・強制可視 PROBE 版）
 *
 * 目的：
 * 1) 本ファイルが /writer で本当に使われているか → 画面上部に紫の「DEBUG PROBE」バナーを常時表示
 * 2) 演出が DOM に載っていないのか/状態が立っていないのか → 「テスト表示」ボタンで justCompleted を手動で true に
 * 3) reduce-motion/overflow/z-index の影響切り分け → initial={false} / overflow-visible / z-50 / 静的opacity を併用
 * 4) コンソールログで時系列追跡
 *
 * 注意：本ファイルでの UI 構造・テストIDは変更していません（API/テスト構成は不変更）
 */

const STORAGE_KEY = "writer_draft_text_v1";
const PROBE_ID = "WriterProbe-v1";

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

  // 完成演出
  const [justCompleted, setJustCompleted] = useState(false);

  // 診断カウンタ
  const [hotkeyCnt, setHotkeyCnt] = useState(0);
  const [loadCnt, setLoadCnt] = useState(0);
  const [copyCnt, setCopyCnt] = useState(0);
  const [scrollCnt, setScrollCnt] = useState(0);

  const outputRef = useRef<HTMLDivElement | null>(null);

  // === PROBE: 初期化ログ ===
  useEffect(() => {
    console.log(`[${PROBE_ID}] mounted: /writer ClientPage.tsx`);
  }, []);

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

  // Prompt
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

  // 生成
  const onGenerate = useCallback(async () => {
    if (loading) return;
    setLoadCnt((n) => n + 1);
    setLoading(true);
    setError("");
    setOutput("");
    console.log(`[${PROBE_ID}] onGenerate: start`);

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
        console.log(`[${PROBE_ID}] onGenerate: API error`, data);
        return;
      }
      const out = data.output ?? data.data?.text ?? "";
      await minSpin;
      setOutput(out);
      console.log(`[${PROBE_ID}] onGenerate: output set (length=${out.length})`);

      // 直接発火
      setJustCompleted(true);
      console.log(`[${PROBE_ID}] justCompleted → true (by onGenerate)`);
    } catch (e: any) {
      await minSpin;
      setError(e?.message ?? "network error");
      console.log(`[${PROBE_ID}] onGenerate: network error`, e);
    } finally {
      setLoading(false);
      console.log(`[${PROBE_ID}] onGenerate: end`);
    }
  }, [loading, prompt]);

  // 出力更新後スクロール
  useEffect(() => {
    if (!loading && output) {
      requestAnimationFrame(() => {
        outputRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        setScrollCnt((n) => n + 1);
      });
    }
  }, [loading, output]);

  // justCompleted の寿命
  useEffect(() => {
    if (!justCompleted) return;
    console.log(`[${PROBE_ID}] justCompleted: SHOW (3.2s)`);
    const t = setTimeout(() => {
      setJustCompleted(false);
      console.log(`[${PROBE_ID}] justCompleted: HIDE`);
    }, 3200);
    return () => clearTimeout(t);
  }, [justCompleted]);

  // 保険発火（空→非空）
  const prevOutputRef = useRef<string>("");
  useEffect(() => {
    const prev = prevOutputRef.current;
    if (!prev && output && !loading && !error) {
      setJustCompleted(true);
      console.log(`[${PROBE_ID}] justCompleted → true (by output transition)`);
    }
    prevOutputRef.current = output;
  }, [output, loading, error]);

  // Ctrl/⌘+Enter（document）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const mod = isMac ? e.metaKey : e.ctrlKey;
      // @ts-ignore
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
      await navigator.clipboard.writeText(output || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const isStub = output.includes("【STUB出力】");

  // スパークル座標
  const sparkles = useMemo(
    () =>
      Array.from({ length: 12 }).map((_, i) => {
        const r = (i * 37) % 100;
        const c = (i * 61) % 100;
        return { top: `${10 + (r % 80)}%`, left: `${5 + (c % 90)}%`, delay: (i % 6) * 0.08 };
      }),
    []
  );

  // 手動テスト表示
  const manualShow = () => {
    setJustCompleted(true);
    console.log(`[${PROBE_ID}] justCompleted → true (by manual test button)`);
  };

  return (
    <main className="mx-auto max-w-6xl p-6" onKeyDown={onKeyDownCapture} data-probe-id={PROBE_ID}>
      {/* === 常時表示：紫の DEBUG バナー（この表示が無ければ別ファイルが使われています） === */}
      <div className="sticky top-0 z-[60] -mx-6 mb-2 bg-[#ede7ff] px-3 py-2 text-[12px] text-[#3a2ca8] border-b border-[#d6cbff]">
        <div className="flex items-center gap-3">
          <strong>DEBUG PROBE</strong>
          <span>ファイル: app/writer/ClientPage.tsx</span>
          <span>ProbeID: {PROBE_ID}</span>
          <Button type="button" size="sm" variant="secondary" onClick={manualShow}>
            テスト表示（演出を強制ON）
          </Button>
          {justCompleted && (
            <span className="inline-flex items-center gap-1 text-[#007a3d]">
              <span className="inline-block h-2 w-2 rounded-full bg-[#00c853]" />
              完成演出ON
            </span>
          )}
        </div>
      </div>

      {/* 既存ヘッダー */}
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

      {/* 2カラム */}
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

            {/* 参考テキスト */}
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

            <div className="pt-1 flex gap-2">
              <Button type="button" onClick={onGenerate} disabled={loading} variant="primary">
                {loading ? "生成しています…" : "生成する"}
              </Button>
              {/* 手動テスト表示（演出を強制ON） */}
              <Button type="button" variant="secondary" onClick={manualShow}>
                テスト表示
              </Button>
            </div>
          </div>
        </section>

        {/* 出力（overflow-visible でクリッピング回避） */}
        <section className="rounded-xl border p-4 overflow-visible">
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

          <div className="relative overflow-visible">
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

            {/* 完成演出：initial=false + 静的opacity + z-50 */}
            <AnimatePresence initial={false}>
              {justCompleted && !loading && !error && (
                <div
                  className="pointer-events-none absolute inset-0 z-50"
                  style={{ outline: "1px dashed rgba(255,0,0,.35)" }} // 位置可視化（一時）
                  onAnimationStart={() => console.log(`[${PROBE_ID}] overlay: animation start`)}
                  onAnimationEnd={() => console.log(`[${PROBE_ID}] overlay: animation end`)}
                >
                  {/* 左上緑点（3.2s間だけ） */}
                  <div className="absolute left-1 top-1 h-2 w-2 rounded-full bg-emerald-400 shadow" />

                  {/* 淡い光（reduce-motionでも見える最低限の静的表示） */}
                  <motion.div
                    className="absolute -inset-2 rounded-[10px] ring-2 ring-yellow-300/40"
                    style={{ opacity: 1 }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 0.85, 0.45, 0.65, 0] }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 2.6, ease: "easeInOut" }}
                  />

                  {/* スパークル群（基準opacity 1） */}
                  {sparkles.map((s, i) => (
                    <motion.span
                      key={i}
                      className="absolute text-base select-none"
                      style={{ top: s.top, left: s.left, opacity: 1 }}
                      initial={{ opacity: 0, y: 0, scale: 0.6, rotate: 0 }}
                      animate={{ opacity: [0, 1, 0], y: -18, scale: 1.1, rotate: 20 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 1.0, delay: s.delay, ease: "easeOut" }}
                      aria-hidden="true"
                    >
                      ✨
                    </motion.span>
                  ))}

                  {/* 称賛メッセージ（静的＋アニメ） */}
                  <motion.div
                    role="status"
                    aria-live="polite"
                    className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2"
                    style={{ opacity: 1 }}
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.98 }}
                    transition={{ duration: 0.4 }}
                  >
                    <div className="rounded-full bg-white/90 shadow-md border px-4 py-1.5 text-xs font-medium text-gray-800 backdrop-blur">
                      良い仕上がり！ <span aria-hidden="true">✨</span> 伝わる文章が完成しました
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
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
