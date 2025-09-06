// FILE: app/writer/page.tsx
"use client";

import * as React from "react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Copy, Check, ChevronDown, Eye, Trash2 } from "lucide-react";

/** ===== API応答型 ===== */
type WriterResponse = { content: string };

const ENDPOINT = "/api/writer";
const PN_MAX = 80;
const AUD_MAX = 80;
const EX_MAX = 500;

/** ===== 入出力型 ===== */
type Payload = {
  productName: string;
  audience: string;
  tone: string;
  length: string;
  prompt: string;
};

type PresetKey = "none" | "ec" | "realestate" | "saas";

/** ▼ プレースホルダ（phProduct/phAudience）を追加 */
const PRESETS: Record<
  PresetKey,
  {
    label: string;
    tone: string;
    length: string;
    prompt: string;
    phProduct: string;
    phAudience: string;
  }
> = {
  none: {
    label: "（なし）手動で入力",
    tone: "標準",
    length: "中",
    prompt: "",
    phProduct: "例: 超軽量ランニングシューズ",
    phAudience: "例: フルマラソン完走を目指す初心者",
  },
  ec: {
    label: "EC（物販）",
    tone: "セールス",
    length: "中",
    prompt:
      "【構成】1. ベネフィット先出し 2. 主要スペック（数値） 3. 使用シーン 4. お手入れ/注意 5. 購入後サポート\n【制約】誇大表現NG・実測値は曖昧にしない\n【トーン】購入を後押ししつつ誠実",
    phProduct: "例: 吸水速乾Tシャツ / 500ml軽量ボトル",
    phAudience: "例: 在宅ワーカー / 夏場の通勤者",
  },
  realestate: {
    label: "不動産（賃貸/売買）",
    tone: "フォーマル",
    length: "長",
    prompt:
      "【構成】1. 物件概要 2. 立地/周辺環境 3. 設備/仕様 4. ランニングコスト 5. 注意事項（騒音/日照/規約）\n【制約】景観/日照の表現は客観的に、将来価値の断定NG",
    phProduct: "例: 2LDK 南向き / 築7年 / 角部屋",
    phAudience: "例: 小学校近くを希望するファミリー",
  },
  saas: {
    label: "SaaS（B2B）",
    tone: "標準",
    length: "中",
    prompt:
      "【構成】1. 課題/現状 2. ソリューション 3. 主要機能 4. 導入メリット(KPI/事例) 5. セキュリティ/運用\n【制約】再現性のない成果の断定NG・統計は出典をぼかさない",
    phProduct: "例: 請求自動化プラットフォーム",
    phAudience: "例: 経理の月次締めに課題がある中堅企業",
  },
};

/** ===== 簡易パーサ（セクション表示） ===== */
type Block =
  | { type: "heading"; text: string }
  | { type: "list"; items: string[] }
  | { type: "para"; text: string };

function parseContentToBlocks(content: string): Block[] {
  const lines = content.split(/\r?\n/);
  const blocks: Block[] = [];
  let currentList: string[] | null = null;

  const flushList = () => {
    if (currentList && currentList.length) blocks.push({ type: "list", items: currentList });
    currentList = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushList();
      continue;
    }
    const headingMatch = line.match(/^【(.+?)】/);
    if (headingMatch) {
      flushList();
      const title = headingMatch[1].trim();
      blocks.push({ type: "heading", text: title });
      const rest = line.replace(/^【.+?】/, "").trim();
      if (rest) blocks.push({ type: "para", text: rest });
      continue;
    }
    if (/^[-・]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      if (!currentList) currentList = [];
      currentList.push(line.replace(/^[-・]\s+/, "").replace(/^\d+\.\s+/, ""));
      continue;
    }
    flushList();
    blocks.push({ type: "para", text: line });
  }
  flushList();
  return blocks;
}

function SectionView({ content }: { content: string }) {
  const blocks = useMemo(() => parseContentToBlocks(content), [content]);
  return (
    <article className="prose prose-neutral max-w-none dark:prose-invert">
      {blocks.map((b, i) => {
        if (b.type === "heading")
          return (
            <h3 key={i} className="mt-4 scroll-m-20 text-lg font-semibold tracking-tight">
              {b.text}
            </h3>
          );
        if (b.type === "list")
          return (
            <ul key={i} className="my-2 list-disc pl-6">
              {b.items.map((it, idx) => (
                <li key={idx}>{it}</li>
              ))}
            </ul>
          );
        return (
          <p key={i} className="my-2">
            {b.text}
          </p>
        );
      })}
    </article>
  );
}

/** ===== 履歴（localStorage） ===== */
type HistoryItem = {
  id: string;
  createdAt: number;
  payload: Payload;
  content: string;
};
const LS_KEY = "shopwriter.history.v1";
const HISTORY_MAX = 50;

function loadHistory(): HistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as HistoryItem[];
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x) => x && typeof x.content === "string")
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, HISTORY_MAX);
  } catch {
    return [];
  }
}

function saveHistory(items: HistoryItem[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items.slice(0, HISTORY_MAX)));
  } catch {
    // 保存失敗は無視（容量制限など）
  }
}

/** ===== 画面コンポーネント ===== */
export default function WriterPage() {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<"input" | "output" | "history">("input");

  // 入力
  const [productName, setProductName] = useState("");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState("標準");
  const [length, setLength] = useState("中");
  const [prompt, setPrompt] = useState("");
  const [preset, setPreset] = useState<PresetKey>("none");

  // ▼ プリセットに応じて placeholder を動的決定（入力値は変えない）
  const phProduct = PRESETS[preset]?.phProduct ?? PRESETS.none.phProduct;
  const phAudience = PRESETS[preset]?.phAudience ?? PRESETS.none.phAudience;

  // 検証
  const [errors, setErrors] = useState<{ productName?: string; audience?: string; prompt?: string }>({});
  const isProductNameValid = useMemo(() => productName.trim().length > 0 && productName.length <= PN_MAX, [productName]);
  const isAudienceValid = useMemo(() => audience.trim().length > 0 && audience.length <= AUD_MAX, [audience]);
  const isPromptValid = useMemo(() => prompt.length <= EX_MAX, [prompt]);
  const isFormValid = isProductNameValid && isAudienceValid && isPromptValid;

  // 出力/ペイロード
  const [result, setResult] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [showPayload, setShowPayload] = useState(false);
  const [lastPayload, setLastPayload] = useState<Payload | null>(null);

  // 履歴
  const [history, setHistory] = useState<HistoryItem[]>([]);
  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const validateAll = () => {
    const next: typeof errors = {};
    if (!isProductNameValid) next.productName = productName.trim().length === 0 ? "商品名は必須です。" : `商品名は ${PN_MAX} 文字以内で入力してください。`;
    if (!isAudienceValid) next.audience = audience.trim().length === 0 ? "想定読者は必須です。" : `想定読者は ${AUD_MAX} 文字以内で入力してください。`;
    if (!isPromptValid) next.prompt = `補足は ${EX_MAX} 文字以内で入力してください。`;
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const applyPreset = (key: PresetKey) => {
    const p = PRESETS[key];
    setPreset(key);
    setTone(p.tone);
    setLength(p.length);
    setPrompt(p.prompt);
    toast({ description: `テンプレ「${p.label}」を適用しました。` });
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validateAll()) {
      toast({ description: "未入力または文字数オーバーがあります。" });
      return;
    }

    const payload: Payload = {
      productName: productName.trim(),
      audience: audience.trim(),
      tone: tone.trim() || "標準",
      length: length.trim() || "中",
      prompt: prompt.trim(),
    };

    setLastPayload(payload);
    setShowPayload(false);
    setResult("");
    setActiveTab("output");
    setCopied(false);

    startTransition(async () => {
      try {
        const res = await fetch(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`API Error: ${res.status}`);

        const data = (await res.json()) as WriterResponse;
        const content = data.content ?? "";

        setResult(content);
        if (!content) {
          toast({ description: "生成結果が空でした。" });
          return;
        }

        // 履歴保存
        const item: HistoryItem = {
          id: crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          createdAt: Date.now(),
          payload,
          content,
        };
        const next = [item, ...history].slice(0, HISTORY_MAX);
        setHistory(next);
        saveHistory(next);
      } catch (err) {
        console.error(err);
        toast({ description: "生成に失敗しました。APIのURLとログ（Vercel Deploy Logs）を確認してください。" });
      }
    });
  };

  const onClear = () => {
    setProductName("");
    setAudience("");
    setTone("標準");
    setLength("中");
    setPrompt("");
    setPreset("none");
    setErrors({});
    setResult("");
    setCopied(false);
    setShowPayload(false);
    setLastPayload(null);
    toast({ description: "入力をクリアしました。" });
  };

  const copyText = async (text: string) => {
    try {
      if (!text) return;
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      toast({ description: "コピーしました。" });
    } catch {
      toast({ description: "コピーに失敗しました。" });
    }
  };

  const copyResult = async () => {
    if (!result) return;
    await copyText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const payloadJson = useMemo(() => (lastPayload ? JSON.stringify(lastPayload, null, 2) : ""), [lastPayload]);
  const copyPayload = async () => {
    if (!payloadJson) return;
    await copyText(payloadJson);
  };

  const openHistoryItem = (item: HistoryItem) => {
    setLastPayload(item.payload);
    setResult(item.content);
    setActiveTab("output");
    setShowPayload(false);
    toast({ description: "履歴を表示しました。" });
  };

  const deleteHistoryItem = (id: string) => {
    const next = history.filter((h) => h.id !== id);
    setHistory(next);
    saveHistory(next);
    toast({ description: "履歴を削除しました。" });
  };

  const clearAllHistory = () => {
    setHistory([]);
    saveHistory([]);
    toast({ description: "履歴をすべて削除しました。" });
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <section className="mb-6">
        <h1 className="text-2xl font-semibold">ShopWriter</h1>
        <p className="text-sm text-muted-foreground">
          入力／出力／履歴をタブで整理。プリセットに応じてプレースホルダを自動提案します。
        </p>
      </section>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="input">入力</TabsTrigger>
          <TabsTrigger value="output">出力</TabsTrigger>
          <TabsTrigger value="history">履歴</TabsTrigger>
        </TabsList>

        {/* ===== 入力タブ ===== */}
        <TabsContent value="input" className="space-y-6">
          <form onSubmit={onSubmit} className="space-y-6">
            {/* プリセット行 */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <div className="space-y-2 md:col-span-1">
                <Label>テンプレ（プリセット）</Label>
                <Select value={preset} onValueChange={(v) => applyPreset(v as PresetKey)}>
                  <SelectTrigger>
                    <SelectValue placeholder="選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{PRESETS.none.label}</SelectItem>
                    <SelectItem value="ec">{PRESETS.ec.label}</SelectItem>
                    <SelectItem value="realestate">{PRESETS.realestate.label}</SelectItem>
                    <SelectItem value="saas">{PRESETS.saas.label}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">選ぶと「トーン/分量/補足」に即時反映。商品名/読者はそのまま。</p>
              </div>

              {/* 商品名 / 読者（placeholder がプリセットで変わる） */}
              <div className="space-y-2">
                <Label htmlFor="productName">商品名（必須）</Label>
                <Input
                  id="productName"
                  placeholder={phProduct}
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  aria-invalid={!isProductNameValid || !!errors.productName}
                  className={!isProductNameValid || errors.productName ? "border-destructive focus-visible:ring-destructive" : ""}
                />
                <p className="text-xs text-muted-foreground">{productName.length}/{PN_MAX} 文字</p>
                {errors.productName ? (
                  <p className="text-xs text-destructive">{errors.productName}</p>
                ) : !isProductNameValid ? (
                  <p className="text-xs text-destructive">商品名は必須です（{PN_MAX}文字以内）。</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="audience">想定読者（必須）</Label>
                <Input
                  id="audience"
                  placeholder={phAudience}
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  aria-invalid={!isAudienceValid || !!errors.audience}
                  className={!isAudienceValid || errors.audience ? "border-destructive focus-visible:ring-destructive" : ""}
                />
                <p className="text-xs text-muted-foreground">{audience.length}/{AUD_MAX} 文字</p>
                {errors.audience ? (
                  <p className="text-xs text-destructive">{errors.audience}</p>
                ) : !isAudienceValid ? (
                  <p className="text-xs text-destructive">想定読者は必須です（{AUD_MAX}文字以内）。</p>
                ) : null}
              </div>
            </div>

            {/* トーン / 分量 */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label>トーン</Label>
                <Select value={tone} onValueChange={(v) => setTone(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="標準">標準</SelectItem>
                    <SelectItem value="カジュアル">カジュアル</SelectItem>
                    <SelectItem value="フォーマル">フォーマル</SelectItem>
                    <SelectItem value="セールス">セールス</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">未選択可：既定は「標準」</p>
              </div>

              <div className="space-y-2">
                <Label>分量</Label>
                <Select value={length} onValueChange={(v) => setLength(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="短">短（要点のみ）</SelectItem>
                    <SelectItem value="中">中（標準）</SelectItem>
                    <SelectItem value="長">長（丁寧）</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">未選択可：既定は「中」</p>
              </div>
            </div>

            {/* 補足 */}
            <div className="space-y-2">
              <Label htmlFor="prompt">補足プロンプト（任意）</Label>
              <Textarea
                id="prompt"
                placeholder="強調したい特徴やNG表現などがあれば記入"
                className="min-h-[120px] resize-y"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                aria-invalid={!isPromptValid || !!errors.prompt}
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{prompt.length}/{EX_MAX} 文字</p>
                {!isPromptValid && <p className="text-xs text-destructive">{errors.prompt ?? `補足は${EX_MAX}文字以内です。`}</p>}
              </div>
            </div>

            <Separator />

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={isPending || !isFormValid}>{isPending ? "生成中…" : "生成する"}</Button>
              <Button type="button" variant="secondary" onClick={onClear} disabled={isPending}>クリア</Button>
              {!isFormValid && <p className="text-xs text-destructive">入力に不備があります（赤い項目を修正してください）</p>}
            </div>
          </form>
        </TabsContent>

        {/* ===== 出力タブ ===== */}
        <TabsContent value="output">
          <div className="rounded-2xl border p-4">
            <div className="mb-2 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={copyResult}
                disabled={!result}
                className="inline-flex items-center gap-2"
                aria-label="生成結果をコピー"
                title="生成結果をコピー"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "コピー済み" : "コピー"}
              </Button>

              <Collapsible open={showPayload} onOpenChange={setShowPayload} className="w-auto">
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="inline-flex items-center gap-1"
                    aria-expanded={showPayload}
                    aria-controls="payload-panel"
                    disabled={!lastPayload}
                    title="送信ペイロードを表示/非表示"
                  >
                    <span>ペイロード</span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${showPayload ? "rotate-180" : ""}`} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent id="payload-panel">
                  <div className="mt-2 rounded-md border bg-muted/40 p-3">
                    {lastPayload ? (
                      <>
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-xs text-muted-foreground">最終送信内容（JSON）</p>
                          <Button type="button" variant="outline" size="xs" onClick={copyPayload}>
                            コピー
                          </Button>
                        </div>
                        <pre className="max-h-64 overflow-auto rounded bg-background p-3 text-xs">
                          <code>{payloadJson}</code>
                        </pre>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">まだ送信履歴がありません。</p>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>

            {isPending ? (
              <div className="space-y-3">
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-11/12" />
                <Skeleton className="h-4 w-10/12" />
                <Skeleton className="h-4 w-9/12" />
              </div>
            ) : result ? (
              <SectionView content={result} />
            ) : (
              <p className="text-sm text-muted-foreground">ここに生成結果が表示されます。入力タブで内容を記入して「生成する」を押してください。</p>
            )}
          </div>
        </TabsContent>

        {/* ===== 履歴タブ ===== */}
        <TabsContent value="history">
          <div className="rounded-2xl border p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">最近 {history.length} 件（最大 {HISTORY_MAX} 件まで保存）</p>
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setHistory(loadHistory())}>
                  再読込
                </Button>
                <Button type="button" variant="destructive" size="sm" onClick={clearAllHistory} disabled={history.length === 0}>
                  すべて削除
                </Button>
              </div>
            </div>

            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">履歴はまだありません。生成後に自動保存されます。</p>
            ) : (
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {history.map((h) => {
                  const d = new Date(h.createdAt);
                  const title =
                    h.payload.productName?.trim() ||
                    (h.content.split("\n").find((x) => x.trim()) ?? "無題");
                  return (
                    <li key={h.id} className="rounded-lg border p-3">
                      <div className="mb-2">
                        <h4 className="line-clamp-1 text-sm font-medium">{title}</h4>
                        <p className="text-xs text-muted-foreground">
                          {d.toLocaleString()} / {h.payload.tone} / {h.payload.length}
                        </p>
                      </div>
                      <div className="mb-2 line-clamp-3 text-sm text-muted-foreground">
                        {h.content}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="inline-flex items-center gap-1"
                          onClick={() => openHistoryItem(h)}
                          title="表示"
                        >
                          <Eye className="h-4 w-4" />
                          表示
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="inline-flex items-center gap-1"
                          onClick={() => copyText(h.content)}
                          title="コピー"
                        >
                          <Copy className="h-4 w-4" />
                          コピー
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          className="inline-flex items-center gap-1"
                          onClick={() => deleteHistoryItem(h.id)}
                          title="削除"
                        >
                          <Trash2 className="h-4 w-4" />
                          削除
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </main>
  );
}
