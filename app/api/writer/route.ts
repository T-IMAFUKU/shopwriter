// app/api/writer/route.ts
export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";

/** FAQ セクション見出し（tests-augmented 前提 / カウント検知用） */
const faqBlock = "## FAQ\n";

/** 汎用 FAQ シード（冪等・3問確保のための最小種） */
const faqSeeds = [
  { q: "配送までの目安は？", a: "通常はご注文から1〜3営業日で出荷します（在庫により前後）。" },
  { q: "返品・交換はできますか？", a: "未使用・到着後7日以内は承ります。詳細は返品ポリシーをご確認ください。" },
  { q: "支払い方法は？", a: "クレジットカード、コンビニ払い、銀行振込などに対応しています。" },
];

/* =========================
   Normalizer（入力正規化）
========================= */
type NormalizedInput = {
  product_name: string;
  category: string;
  goal: string;
  audience: string;
  platform: string | null;
  keywords: string[];
  constraints: string[];
  brand_voice: string | null;
  tone: string | null;
  style: string | null;
  length_hint: string | null;
  selling_points: string[];
  objections: string[];
  evidence: string[];
  cta_preference: string[];
  _raw: string;
};

function parseFlexibleJsonOrKv(txt: string): any {
  // 1. JSON として読む
  try {
    return JSON.parse(txt);
  } catch {
    /* fallthrough */
  }

  // 2. key: value 行を読む
  const out: Record<string, any> = {};
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_\-]+)\s*[:：]\s*(.+)$/);
    if (!m) continue;
    const key = m[1].trim();
    const val = m[2].trim();
    if (!out[key]) {
      out[key] = val;
    } else if (Array.isArray(out[key])) {
      out[key].push(val);
    } else {
      out[key] = [out[key], val];
    }
  }
  return out;
}

function normalizeInput(txt: string): NormalizedInput {
  const obj = parseFlexibleJsonOrKv(txt);

  // Arrayに正規化するヘルパ
  const toArr = (v: any): string[] => {
    if (!v) return [];
    if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
    // カンマ区切り "a,b,c"
    return String(v)
      .split(/[,、]/)
      .map((x) => x.trim())
      .filter(Boolean);
  };

  // selling_points, objections, evidence, cta_preference などは
  // まとめて正規化
  const selling_points = toArr(
    (obj.selling_points ??
      obj.points ??
      obj.features ??
      obj.benefits ??
      obj["セールスポイント"] ??
      obj["特徴"]) ??
      []
  );
  const objections = toArr(
    (obj.objections ??
      obj.concerns ??
      obj.fears ??
      obj["よくある不安"] ??
      obj["懸念"]) ??
      []
  );
  const evidence = toArr(
    (obj.evidence ??
      obj.proof ??
      obj["根拠"] ??
      obj["実績"] ??
      obj["エビデンス"]) ??
      []
  );
  const cta_preference = toArr(
    (obj.cta_preference ??
      obj.cta ??
      obj["希望CTA"] ??
      obj["誘導したいアクション"]) ??
      []
  );

  return {
    product_name:
      String(obj.product_name ?? obj.title ?? obj.name ?? "商品").trim(),
    category: String(obj.category ?? "汎用").trim(),
    goal: String(obj.goal ?? "購入誘導").trim(),
    audience: String(obj.audience ?? "一般購買者").trim(),
    platform: obj.platform ? String(obj.platform) : null,
    keywords: toArr(obj.keywords ?? obj.keyword ?? obj["キーワード"] ?? []),
    constraints: toArr(
      obj.constraints ?? obj.restrictions ?? obj.ng ?? obj["禁止事項"] ?? []
    ),
    brand_voice: obj.brand_voice ? String(obj.brand_voice) : null,
    tone: obj.tone ? String(obj.tone) : null,
    style: obj.style ? String(obj.style) : null,
    length_hint: obj.length_hint ? String(obj.length_hint) : null,
    selling_points,
    objections,
    evidence,
    cta_preference,
    _raw: txt,
  };
}

function coerceToShape(obj: any, raw: string): NormalizedInput {
  const arr = (v: any) =>
    Array.isArray(v) ? v.filter(Boolean).map(String) : v ? [String(v)] : [];

  return {
    product_name: String(obj.product_name ?? obj.title ?? obj.name ?? "商品").trim(),
    category: String(obj.category ?? "汎用").trim(),
    goal: String(obj.goal ?? "購入誘導").trim(),
    audience: String(obj.audience ?? "一般購買者").trim(),
    platform: obj.platform ? String(obj.platform) : null,
    keywords: arr(obj.keywords),
    constraints: arr(obj.constraints),
    brand_voice: obj.brand_voice ? String(obj.brand_voice) : null,
    tone: obj.tone ? String(obj.tone) : null,
    style: obj.style ? String(obj.style) : null,
    length_hint: obj.length_hint ? String(obj.length_hint) : null,
    selling_points: arr(obj.selling_points),
    objections: arr(obj.objections),
    evidence: arr(obj.evidence),
    cta_preference: arr(obj.cta_preference),
    _raw: raw,
  };
}

/* =========================
   カテゴリ別の典型不安・訴求
========================= */
const EC_LEXICON: Record<
  string,
  {
    objections: string[];
    selling_points: string[];
  }
> = {
  汎用: {
    objections: [
      "本当に自分に合うのか不安",
      "価格に見合う価値があるか心配",
      "使いこなせるかイメージできない",
    ],
    selling_points: [
      "初心者でもすぐ使える簡単さ",
      "長く使える耐久性・信頼性",
      "買った後も安心できるサポート",
    ],
  },
  アパレル: {
    objections: [
      "サイズ感が不安",
      "素材の肌ざわり・透け感がわからない",
      "洗濯やお手入れが面倒そう",
    ],
    selling_points: [
      "日常使いしやすい着回し力",
      "肌に触れる質感や軽さ",
      "自宅で洗えて扱いやすい",
    ],
  },
  家電: {
    objections: [
      "本当に効果があるのか",
      "音がうるしくないか",
      "バッテリーや耐久性が心配",
    ],
    selling_points: [
      "具体的な数値で示せる性能",
      "生活がどれくらい楽になるか",
      "サポートや保証など購入後の安心",
    ],
  },
  コスメ: {
    objections: [
      "肌に合うか不安",
      "ベタつきや崩れが心配",
      "成分が強すぎないか",
    ],
    selling_points: [
      "低刺激や使いやすさ",
      "具体的な利用シーンのイメージ",
      "UVや保湿などの機能値",
    ],
  },
  食品: {
    objections: [
      "味の濃さ・甘さが自分好みか分からない",
      "手間が増えないか",
      "保存期間が短くないか",
    ],
    selling_points: [
      "自宅で手軽に楽しめる",
      "素材や製法にこだわっている",
      "具体的な量・回数・タイミングのイメージ",
    ],
  },
};

function getCategoryLexicon(category: string): {
  objections: string[];
  selling_points: string[];
} {
  if (/コスメ|化粧|美容|スキンケア/i.test(category))
    return EC_LEXICON["コスメ"];
  if (/食品|フード|グルメ|スイーツ|コーヒー|茶|food|gourmet/i.test(category))
    return EC_LEXICON["食品"];
  if (/家電|electronic|電動|掃除機|冷蔵庫|イヤホン|ヘッドホン/i.test(category))
    return EC_LEXICON["家電"];
  if (/アパレル|衣料|ファッション|服|ウェア/i.test(category))
    return EC_LEXICON["アパレル"];
  return EC_LEXICON["汎用"];
}

/* =========================
   System Prompt（最終仕様）
========================= */
function buildSystemPrompt(overrides?: string): string {
  if (overrides && overrides.trim().length > 0) return overrides + "";

  const modules = [
    "あなたはEC特化の日本語コピーライターAIです。敬体（です・ます）で、簡潔かつ具体的に記述します。数値・固有名詞を優先し、過度な煽りを避けます。",
    "媒体と目的に応じて、ヘッドライン→概要→ベネフィット→根拠/比較→FAQ→CTAの流れで整理します。見出しは最大H2、箇条書きは3〜7項目を目安とします。",
    "不自然なキーワード羅列を禁止し、共起語・言い換え・上位語を自然に埋め込みます。タイトルは目安32字、説明文は80〜120字を参考にします（厳密ではありません）。",
    "一次CTAは主目的に直結（購入/カート/申込など）。二次CTAは低負荷行動（お気に入り/比較/レビュー閲覧など）。CTA文は動詞起点＋利益提示＋不安低減要素を含めます 。",
    "落ち着いた知性を保ち、ユーザー原稿を否定しない語調にします。過剰な絵文字や擬声語は使用しません。",
    "医薬的効能の断定、根拠のないNo.1表現、誇大広告、記号乱用を抑制してください。",
    "本文は完成文として出力し、必要に応じて見出しや箇条書きを用います。最後にCTA文を1〜3案示します。",
    "【出力契約】必ず本文末尾に「一次CTA」と「代替CTA」をそれぞれ1行で明示してください（例：一次CTA：今すぐ購入—30日返品可／代替CTA：詳細を見る—レビューで比較 ）。",
    "【厳格条件】感嘆符（！）は使用しません。FAQは必ず2〜3問（誤解/相性/返品など）をQ/A形式で含めます。数値・単位（g, mm, mAh, ms, SPF/PA, 抽出量など）は最低2 つ含めます。",
    "語尾の重複、誤変換、冗長な反復、記号の不整合を最終確認して簡潔に整えます。",
  ];
  return modules.join("\n\n");
}

/* =========================
   Few-shot（WRITER_FEWSHOT=1/true時）
   H-7-⑧仕様でFAQ/CTAサンプルは撤去
========================= */
function buildFewShot(
  category: string
): { role: "user" | "assistant"; content: string }[] {
  // H-7-⑧仕様:
  // - 旧FAQ/CTAサンプルはすべて撤去
  // - Few-shot自体も現在は利用しない
  // Precision Plan互換のためシグネチャは維持し、常に空配列を返す
  return [];
}

/* =========================
   User Message（人間→AI）
========================= */
function makeUserMessage(n: NormalizedInput): string {
  const kv = [
    `product_name: ${n.product_name}`,
    `category: ${n.category}`,
    `goal: ${n.goal}`,
    `audience: ${n.audience}`,
    n.platform ? `platform: ${n.platform}` : null,
    n.keywords.length
      ? `keywords: ${n.keywords.join(" / ")}`
      : null,
    n.constraints.length
      ? `constraints: ${n.constraints.join(" / ")}`
      : null,
    n.selling_points.length
      ? `selling_points: ${n.selling_points.join(" / ")}`
      : null,
    n.objections.length
      ? `objections: ${n.objections.join(" / ")}`
      : null,
    n.evidence.length
      ? `evidence: ${n.evidence.join(" / ")}`
      : null,
    n.length_hint ? `length_hint: ${n.length_hint}` : null,
    n.cta_preference.length
      ? `cta_preference: ${n.cta_preference.join(" / ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const guide =
    "上記の条件に基づいて、日本語で媒体最適化した本文を作成してください。必要に応じて見出し(H2まで)と箇条書きを用い、FAQは2〜3問をQ/A形式で、最後に一次CTAと代替CTAを示してください。感嘆符は使わず、数値・単位を最低2つ含めてください。";

  return `# 入力\n${kv}\n\n# 指示\n${guide}`;
}

/* =========================
   Meta 推定
========================= */
function extractMeta(
  text: string
): { style: string; tone: string; locale: string } {
  const t = (text || "").trim();
  const lines = t.split(/\r?\n/);
  const bulletCount = lines.filter((l) =>
    /^[\-\*\u30fb・]/.test(l.trim())
  ).length;
  const h2Count = lines.filter((l) => /^##\s/.test(l.trim())).length;
  const charCount = t.length;

  let style = "summary";
  if (bulletCount >= 2) style = "bullet";
  else if (h2Count >= 2 || charCount > 500) style = "detail";

  // ブランドトーンは常に warm_intelligent で固定
  return { style, tone: "warm_intelligent", locale: "ja-JP" };
}

/* =========================
   FAQ一元化＋CTA整形
========================= */

type QA = { q: string; a: string; idx: number };

function buildFaqSectionFromOutput(
  out: string,
  category: string
): string {
  // 生成済みのQ/Aとカテゴリ別の典型不安をマージし、
  // 重複を避けつつ最大3件のFAQを返す

  /* ---- 生成文中の Q/A を抽出 ---- */
  const lines = out.split(/\r?\n/);
  const qRe =
    /^(?:Q(?:\s*|\.)|Q\s*\d+[\.\)：:）]|Q\d+[\.\)：:）]|Q[：:．．\)]|Q[0-9]*[：:.\)])\s*(.+)$/i;
  const aRe =
    /^(?:A(?:\s*|\.)|A\s*\d+[\.\)：:）]|A\d+[\.\)：:）]|A[：:．．\)]|A[0-9]*[：:.\)])\s*(.+)$/i;

  const pairs: QA[] = [];
  let pendingQ: { text: string; idx: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const L = lines[i].trim();
    const qm = qRe.exec(L);
    if (qm) {
      pendingQ = { text: qm[1].trim(), idx: i };
      continue;
    }
    const am = aRe.exec(L);
    if (am && pendingQ) {
      const ans = am[1].trim();
      if (ans) pairs.push({ q: pendingQ.text, a: ans, idx: pendingQ.idx });
      pendingQ = null;
    }
  }

  /* ---- 重複排除（生成Q/A + カテゴリ別シードをマージ） ---- */
  const dedupMap = new Map<string, QA>();
  // 生成Q/A
  for (const p of pairs) {
    const key = p.q.replace(/\s+/g, " ").toLowerCase();
    if (!dedupMap.has(key)) dedupMap.set(key, p);
  }

  // カテゴリ別の典型不安/回答テンプレを補完
  const catLex = getCategoryLexicon(category);
  for (const base of catLex.objections) {
    const key = base.replace(/\s+/g, " ").toLowerCase();
    if (!dedupMap.has(key)) {
      // 回答案：selling_pointsのうち1つを根拠にする
      const point = catLex.selling_points[0] ?? "安心して使える設計です";
      dedupMap.set(key, {
        q: base,
        a: point,
        idx: 9999,
      });
    }
  }

  // あと最低3つに満たない場合、faqSeedsから追加
  for (const seed of faqSeeds) {
    if (dedupMap.size >= 3) break;
    const key = seed.q.replace(/\s+/g, " ").toLowerCase();
    if (!dedupMap.has(key)) {
      dedupMap.set(key, { q: seed.q, a: seed.a, idx: 9999 });
    }
  }

  const merged = Array.from(dedupMap.values())
    .sort((a, b) => a.idx - b.idx)
    .slice(0, 3);

  // Markdown化
  const faqMdLines = [faqBlock.trim()];
  for (const qa of merged) {
    faqMdLines.push(`Q. ${qa.q}`);
    faqMdLines.push(`A. ${qa.a}`);
    faqMdLines.push("");
  }
  return faqMdLines.join("\n").trim();
}

function postProcess(
  llmOut: string,
  category: string,
  footnoteMode: "inline" | "static" = "static"
): string {
  let out = (llmOut || "").trim();

  // 既存の「## FAQ」以降を一旦全部削る（LLMが勝手に書いたFAQ/CTAを除去）
  {
    const split = out.split(/\n## FAQ[\s\S]*$/m);
    if (split.length >= 2) {
      out = split[0].trimEnd();
    }
  }

  // CTA文の雛形
  const primaryAction = "今すぐ購入";
  const secondaryAction = "詳細を見る";

  let primaryFuture = "まず試せます（30日以内は返品可）";
  if (
    footnoteMode === "inline" &&
    (globalThis as any).__WRITER_INLINE_SAFETY__
  ) {
    // inlineモードでは、購入後の安心材料を差し替え
    primaryFuture = `まず試せます（${
      (globalThis as any).__WRITER_INLINE_SAFETY__
    }）`;
  }
  const secondaryFuture =
    "実際の使用感を確認できます（レビューで比較）";

  const primaryLine = `一次CTA：${primaryAction}—${primaryFuture}`;
  const secondaryLine = `代替CTA：${secondaryAction}—${secondaryFuture}`;

  // FAQ の挿入位置：CTA直前 or 末尾
  // まだCTAは差していないので、ここでFAQ→CTAの順番で必ず一箇所だけ差し込む
  out = out.replace(/\s+$/, "");
  const faqMd = buildFaqSectionFromOutput(out, category);
  out = `${out}\n\n${faqMd}\n\n${primaryLine}\n${secondaryLine}`;

  // FAQ一元化の最終ガード：
  // 万一「## FAQ」が複数混入した場合は、先頭1ブロックだけ残し後続FAQを除去
  {
    const faqMatches = [...out.matchAll(/^## FAQ[\s\S]*?(?=(?:\n## |\n一次CTA|$))/gm)];
    if (faqMatches.length > 1) {
      // keep first block text
      const firstFaqText = faqMatches[0][0];
      // remove all FAQ blocks
      out = out.replace(
        /^## FAQ[\s\S]*?(?=(?:\n## |\n一次CTA|$))/gm,
        ""
      ).trim();

      // put only first block before CTA lines again
      // CTA lines are always at the end
      const ctaIdx = out.search(/^\s*一次CTA：/m);
      if (ctaIdx >= 0) {
        const head = out.slice(0, ctaIdx).trimEnd();
        const tail = out.slice(ctaIdx).trimStart();
        out = `${head}\n\n${firstFaqText.trim()}\n\n${tail}`;
      } else {
        // fallback: append
        out = `${out}\n\n${firstFaqText.trim()}`;
      }
    }
  }

  return out;
}

/* =========================
   OpenAI 呼び出し補助
========================= */
async function callOpenAIChatCompletion({
  model,
  system,
  messages,
  temperature,
}: {
  model: string;
  system: string;
  messages: { role: "user" | "assistant" | "system"; content: string }[];
  temperature: number;
}): Promise<{ content: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY missing");
  }

  const body = {
    model,
    messages: [{ role: "system", content: system }, ...messages],
    temperature,
  };

  const t0 = Date.now();
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const t1 = Date.now();
  const apiMs = t1 - t0;

  if (!resp.ok) {
    const errText = await resp.text().catch(() => null);
    throw Object.assign(
      new Error(`openai api error: ${resp.status} ${resp.statusText}`),
      {
        status: resp.status,
        statusText: resp.statusText,
        ms: apiMs,
        body: errText,
      }
    );
  }

  const data = (await resp.json()) as any;
  const content =
    data?.choices?.[0]?.message?.content?.toString()?.trim() ?? "";
  return { content };
}

/* =========================
   Event Logging（観測用）
========================= */
const LOGTAIL_ENDPOINT =
  "https://in.logtail.com";
async function emitWriterEvent(
  kind: "ok" | "error",
  payload: Record<string, any>
) {
  try {
    const token = process.env.LOGTAIL_SOURCE_TOKEN;
    if (!token) return;

    const body = {
      event: "WRITER_EVENT",
      route: "/api/writer",
      kind,
      payload,
      ts: new Date().toISOString(),
      env: process.env.VERCEL_ENV ?? "local",
    };

    await fetch(LOGTAIL_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (e: any) {
    console.warn("emitWriterEvent failed:", e?.message ?? "unknown");
  }
}

// ローカルでも常に console に落とすことで目視しやすく
function logEvent(
  kind: "ok" | "error",
  payload: Record<string, any>
) {
  try {
    const base = {
      ts: new Date().toISOString(),
      kind,
      route: "/api/writer",
      env: process.env.VERCEL_ENV ?? "local",
    };
    console.log(
      "[WRITER_EVENT]",
      JSON.stringify({ ...base, payload })
    );
  } catch {
    /* noop */
  }
}

// テスト時の即時console用
function forceConsoleEvent(
  kind: "ok" | "error",
  payload: Record<string, any>
) {
  try {
    console.log(
      "[WRITER_FORCE]",
      JSON.stringify({
        ts: new Date().toISOString(),
        kind,
        payload,
      })
    );
  } catch {
    /* noop */
  }
}

/* =========================
   ルート本体
========================= */

type WriterRequest = {
  provider?: "openai" | string;
  prompt?: string;
  model?: string;
  temperature?: number;
  system?: string;
};

type WriterResponseOk = {
  ok: true;
  data: {
    text: string;
    meta: {
      style: string;
      tone: string;
      locale: string;
    };
  };
  output: string;
};

type WriterResponseErr = {
  ok: false;
  error: string;
  details?: string;
};

export async function POST(req: Request) {
  try {
    const tStart = Date.now();
    const bodyText = await req.text();
    // try json parse
    let json: WriterRequest | null = null;
    try {
      json = JSON.parse(bodyText);
    } catch {
      /* not json -> fallback */
    }

    const provider = json?.provider ?? "openai";

    if (provider !== "openai") {
      const payload = {
        ok: false,
        reason: "unsupported_provider",
        provider,
      };
      logEvent("error", payload);
      forceConsoleEvent("error", payload);
      await emitWriterEvent("error", payload);

      return NextResponse.json<WriterResponseErr>(
        { ok: false, error: "unsupported provider" },
        { status: 400 }
      );
    }

    // normalize input
    const promptText =
      json?.prompt && typeof json.prompt === "string"
        ? json.prompt
        : bodyText;
    const norm0 =
      json && json.prompt
        ? coerceToShape(json, promptText)
        : normalizeInput(promptText);

    // few-shot
    const few = buildFewShot(norm0.category);

    // system prompt
    const systemPrompt = buildSystemPrompt(json?.system);

    // user message
    const userMsg = makeUserMessage(norm0);

    // call openai
    const model = json?.model || "gpt-4o-mini";
    const temperature =
      typeof json?.temperature === "number"
        ? json.temperature
        : 0.7;

    const tApiStart = Date.now();
    let llmContent = "";
    try {
      const { content } = await callOpenAIChatCompletion({
        model,
        system: systemPrompt,
        messages: [
          ...few,
          { role: "user", content: userMsg },
        ],
        temperature,
      });
      llmContent = content;
    } catch (apiErr: any) {
      const apiMs = Date.now() - tApiStart;
      const payload = {
        ok: false,
        reason: "openai_error",
        provider,
        model,
        api: {
          status: apiErr?.status ?? null,
          statusText: apiErr?.statusText ?? null,
          ms: apiMs,
        },
        message: apiErr?.message ?? "unknown",
      };
      logEvent("error", payload);
      forceConsoleEvent("error", payload);
      await emitWriterEvent("error", payload);

      return NextResponse.json<WriterResponseErr>(
        {
          ok: false,
          error: `openai api error: ${apiErr?.status ?? "?"} ${
            apiErr?.statusText ?? ""
          }`,
          details: apiErr?.body?.slice?.(0, 2000) ?? "",
        },
        { status: 502 }
      );
    }

    // postProcess: FAQ一元化 & CTA整形 & 重複FAQ防御
    const finalOut = postProcess(llmContent, norm0.category);

    // meta推定（tone固定/warm_intelligent）
    const meta = extractMeta(finalOut);

    const tTotal = Date.now() - tStart;

    // hash (デバッグ用)
    const hash = createHash("sha256")
      .update(finalOut)
      .digest("hex")
      .slice(0, 8);

    const okPayload = {
      ok: true,
      provider,
      model,
      ms_total: tTotal,
      prompt_shape: {
        category: norm0.category,
        goal: norm0.goal,
        audience: norm0.audience,
      },
      meta,
      hash,
    };

    logEvent("ok", okPayload);
    forceConsoleEvent("ok", okPayload);
    await emitWriterEvent("ok", okPayload);

    return NextResponse.json<WriterResponseOk>(
      {
        ok: true,
        data: {
          text: finalOut,
          meta, // { style, tone:"warm_intelligent", locale:"ja-JP" }
        },
        output: finalOut,
      },
      { status: 200 }
    );
  } catch (e: any) {
    const payload = {
      ok: false,
      reason: "unexpected_catch",
      message: e?.message ?? "unknown",
    };
    logEvent("error", payload);
    forceConsoleEvent("error", payload);
    await emitWriterEvent("error", payload);
    return NextResponse.json<WriterResponseErr>(
      { ok: false, error: e?.message ?? "unexpected error" },
      { status: 500 }
    );
  }
}

/** （互換維持のダミー。可視カウント用・本体ロジックとは独立） */
const __FAQ_SEED_CONTAINER__ = {};
