// app/writer/ClientPage.tsx
"use client";

import React from "react";

type WriterResponse = {
  ok: boolean;
  data?: {
    text: string;
    meta: { style: string; tone: string; locale: string };
  };
  error?: string;
  details?: string;
};

export default function ClientPage() {
  // --- 入力状態 ---
  const [productName, setProductName] = React.useState("");
  const [category, setCategory] = React.useState("家電");
  const [goal, setGoal] = React.useState("購入");
  const [audience, setAudience] = React.useState("一般購買者");
  const [keywords, setKeywords] = React.useState("");
  const [extra, setExtra] = React.useState("");

  // --- 実行状態 ---
  const [loading, setLoading] = React.useState(false);
  const [resp, setResp] = React.useState<WriterResponse | null>(null);
  const [raw, setRaw] = React.useState("");
  const [useJson, setUseJson] = React.useState(true);

  // --- Health（few-shot / stub / model） ---
  const [health, setHealth] = React.useState<{
    few: boolean;
    stub: boolean;
    model: string;
  } | null>(null);

  React.useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/writer/health", { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        setHealth({
          few: !!j?.data?.writer?.fewshotEnabled,
          stub: !!j?.data?.writer?.stubMode,
          model: String(j?.data?.writer?.defaultModel ?? "gpt-4o-mini"),
        });
      } catch {
        // noop
      }
    })();
  }, []);

  // --- 利用ガイド（販売利用者向け・簡潔） ---
  const guideLines = [
    "EC特化の自然な日本語で生成（敬体・数値優先・煽り禁止）。",
    "見出しは最大H2、箇条は3〜7項目、最後に一次/代替CTAを出力。",
    "キーワードは不自然な羅列NG。共起語・言い換えで自然化。",
    "薬機・誇大・No.1断定は不可。必要に応じて緩和語を使用。",
  ];

  // --- プロンプト生成 ---
  function buildPrompt() {
    if (!useJson) {
      const kw = keywords.trim() ? `キーワード:${keywords.trim()}` : "";
      const ext = extra.trim() ? `\n補足:${extra.trim()}` : "";
      return [
        `商品名:${productName || "商品"}`,
        `カテゴリ:${category}`,
        `目的:${goal}`,
        `読者:${audience}`,
        kw,
        ext,
      ]
        .filter(Boolean)
        .join("\n");
    }
    const json = {
      product_name: productName || "商品",
      category,
      goal,
      audience,
      keywords: keywords
        .split(/[、,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
      constraints: [],
      brand_voice: "落ち着いた知性（コーポレートネイビー世界観）",
      tone: "丁寧",
      style: "bullet",
      selling_points: [],
      objections: [],
      evidence: [],
      cta_preference: ["今すぐ購入", "カートに追加", "詳細を見る"],
      note: extra.trim(),
    } as const;
    return JSON.stringify(json);
  }

  // --- 送信 ---
  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResp(null);
    setRaw("");

    const body = {
      provider: "openai",
      model: health?.model || "gpt-4o-mini",
      prompt: buildPrompt(),
    };

    try {
      const r = await fetch("/api/writer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j: WriterResponse = await r.json();
      setResp(j);
      if (j?.ok) setRaw(j.data?.text ?? "");
    } catch (e: any) {
      setResp({ ok: false, error: e?.message ?? "network error" });
    } finally {
      setLoading(false);
    }
  }

  // --- プレースホルダ（初回ガイド＋状態） ---
  function Placeholder() {
    return (
      <ul className="list-disc pl-5 text-sm text-zinc-500 space-y-1">
        {guideLines.map((g) => (
          <li key={g}>{g}</li>
        ))}
        <li>
          few-shot:{" "}
          <span className={health?.few ? "text-emerald-600" : "text-orange-600"}>
            {health?.few ? "ON" : "OFF"}
          </span>
          {" / "}
          接続:{" "}
          <span className={health?.stub ? "text-orange-600" : "text-emerald-600"}>
            {health?.stub ? "スタブ" : "本番(OpenAI)"}
          </span>
        </li>
      </ul>
    );
  }

  // --- UI ---
  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">ShopWriter / Writer</h1>
      <p className="text-sm text-zinc-600 mt-1">
        販売用UI（few-shot最適化）。/api/writer/health で稼働状態を確認できます。
      </p>

      <form onSubmit={handleGenerate} className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 左：入力 */}
        <div className="col-span-1 space-y-3">
          <div>
            <label className="block text-sm font-medium">商品名</label>
            <input
              className="mt-1 w-full rounded-md border px-3 py-2"
              placeholder="例）ノイズキャンセリング完全ワイヤレスイヤホン"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium">カテゴリ</label>
              <select
                className="mt-1 w-full rounded-md border px-3 py-2"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option>家電</option>
                <option>コスメ</option>
                <option>食品</option>
                <option>アパレル</option>
                <option>汎用</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium">目的</label>
              <select
                className="mt-1 w-full rounded-md border px-3 py-2"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
              >
                <option>購入</option>
                <option>カート追加</option>
                <option>会員登録</option>
                <option>資料DL</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium">読者</label>
            <input
              className="mt-1 w-full rounded-md border px-3 py-2"
              placeholder="例）通勤者 / 敏感肌 / 在宅ワーカー など"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium">
              キーワード（自然に埋め込む） <span className="text-zinc-400">(任意)</span>
            </label>
            <input
              className="mt-1 w-full rounded-md border px-3 py-2"
              placeholder="例）連続再生, 低遅延, 高音質"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
            />
            <p className="text-xs text-zinc-500 mt-1">
              ※ 不自然な羅列は禁止。共起語や言い換え、上位語で自然化します。
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium">
              補足（禁則/注意/証拠など） <span className="text-zinc-400">(任意)</span>
            </label>
            <textarea
              className="mt-1 w-full rounded-md border px-3 py-2 h-24"
              placeholder="例）薬機：効能断定NG／返品保証30日／レビュー4.5/5（サンプル10件）"
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={useJson}
                onChange={(e) => setUseJson(e.target.checked)}
              />
              構造化JSONで送る（推奨）
            </label>
            <button
              type="submit"
              className="ml-auto rounded-md bg-black text-white px-4 py-2 text-sm disabled:opacity-50"
              disabled={loading}
            >
              {loading ? "生成中…" : "生成する"}
            </button>
          </div>
        </div>

        {/* 右：出力 */}
        <div className="col-span-1">
          <div className="rounded-lg border p-4 h-full">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">出力</h2>
              <span className="text-xs text-zinc-500">
                {resp?.data?.meta
                  ? `meta: ${resp.data.meta.style} / ${resp.data.meta.tone} / ${resp.data.meta.locale}`
                  : ""}
              </span>
            </div>
            <div className="mt-3 whitespace-pre-wrap text-sm leading-6">
              {!raw ? <Placeholder /> : raw}
            </div>
            {resp && !resp.ok && (
              <div className="mt-3 rounded-md bg-rose-50 text-rose-700 text-sm p-3">
                <div className="font-medium">エラー</div>
                <div>{resp.error}</div>
                {resp.details && (
                  <pre className="mt-2 text-xs opacity-80 overflow-x-auto">{resp.details}</pre>
                )}
              </div>
            )}
          </div>
        </div>
      </form>

      <div className="mt-8 text-xs text-zinc-500">
        <div className="font-medium">出力上の注意（few-shot最適化）</div>
        <ul className="list-disc pl-5 space-y-1 mt-1">
          <li>見出しは最大H2／箇条は3〜7項目。冗長な反復と記号乱用を避けます。</li>
          <li>一次CTAは主目的に直結（購入/カート/申込）、代替CTAも付与します。</li>
          <li>医薬的断定・根拠なきNo.1・誇大表現は不可。必要に応じて緩和語を用います。</li>
        </ul>
      </div>
    </div>
  );
}
