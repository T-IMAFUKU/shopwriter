// app/api/writer/route.ts
// Runtime: Node.js（外部API・環境変数利用のため）
export const runtime = "nodejs";

import { NextResponse } from "next/server";

/**
 * リクエスト
 */
type WriterRequest = {
  provider?: "openai" | string;
  prompt?: string; // 自由文 or JSON
  model?: string;
  temperature?: number;
  system?: string; // 上書き可
};

/**
 * レスポンス
 * CP@2025-09-21.v3-compact（tests-augmented）互換
 */
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

/* =========================
   Normalizer（入力正規化）
========================= */
type NormalizedInput = {
  product_name: string;
  category: string;
  goal: string;
  audience: string;
  platform?: string | null;
  keywords: string[];
  constraints: string[];
  brand_voice?: string | null;
  tone?: string | null;
  style?: string | null;
  length_hint?: string | null;
  selling_points: string[];
  objections: string[];
  evidence: string[];
  cta_preference: string[];
  _raw?: string;
};
function normalizeInput(raw: string | undefined): NormalizedInput {
  const txt = (raw ?? "").toString().trim();

  // JSONっぽければparse
  if (txt.startsWith("{") || txt.startsWith("[")) {
    try {
      const j = JSON.parse(txt);
      const obj = Array.isArray(j) ? j[0] ?? {} : j ?? {};
      return coerceToShape(obj, txt);
    } catch {
      // fallthrough → 自由文として解析
    }
  }

  // 自由文：簡易抽出
  const lower = txt.toLowerCase();
  const pick = (re: RegExp, def = "") => {
    const m = re.exec(txt);
    return (m?.[1] ?? def).toString().trim();
  };

  const product_name =
    pick(/(?:商品名|製品名|product(?:\s+name)?)[：:]\s*(.+)/i) ||
    pick(/『([^』]+)』/) ||
    pick(/「([^」]+)」/) ||
    (txt ? txt.slice(0, 40) : "商品");

  const category =
    pick(/(?:カテゴリ|カテゴリー|category)[：:]\s*(.+)/i) ||
    (lower.includes("美容") || lower.includes("コスメ")
      ? "コスメ"
      : lower.includes("家電") || lower.includes("電動")
      ? "家電"
      : lower.includes("食品") || lower.includes("グルメ")
      ? "食品"
      : lower.includes("アパレル") || lower.includes("衣料") || lower.includes("ファッション")
      ? "アパレル"
      : "汎用");

  const goal =
    pick(/(?:目的|goal)[：:]\s*(.+)/i) ||
    (lower.includes("購入") || lower.includes("カート") ? "購入誘導" : "購入誘導");

  const audience =
    pick(/(?:対象|読者|audience)[：:]\s*(.+)/i) ||
    (lower.includes("ビジネス") ? "ビジネス層" : "一般購買者");

  const platform =
    pick(/(?:媒体|platform)[：:]\s*(.+)/i) ||
    (lower.includes("楽天") ? "楽天" : lower.includes("amazon") ? "アマゾン" : null);

  const split = (s: string) =>
    s
      .split(/[、,\u3001\/\|;；\s]+/)
      .map((v) => v.trim())
      .filter(Boolean);

  const keywords = split(pick(/(?:キーワード|keywords?)[：:]\s*(.+)/i) || "");
  const constraints = split(pick(/(?:制約|constraints?)[：:]\s*(.+)/i) || "");
  const selling_points = split(pick(/(?:強み|特長|selling[_\s-]?points?)[：:]\s*(.+)/i) || "");
  const objections = split(pick(/(?:不安|懸念|objections?)[：:]\s*(.+)/i) || "");
  const evidence = split(pick(/(?:根拠|実証|evidence)[：:]\s*(.+)/i) || "");
  const cta_preference = split(pick(/(?:cta|行動喚起)[：:]\s*(.+)/i) || "");

  return {
    product_name,
    category,
    goal,
    audience,
    platform,
    keywords: Array.from(new Set(keywords)),
    constraints: Array.from(new Set(constraints)),
    brand_voice: null,
    tone: null,
    style: null,
    length_hint: null,
    selling_points: Array.from(new Set(selling_points)),
    objections: Array.from(new Set(objections)),
    evidence: Array.from(new Set(evidence)),
    cta_preference: Array.from(new Set(cta_preference)),
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
   System Prompt（最終仕様）
========================= */
function buildSystemPrompt(overrides?: string): string {
  if (overrides && overrides.trim().length > 0) return overrides + "";

  const modules = [
    // 前提
    "あなたはEC特化の日本語コピーライターAIです。敬体（です・ます）で、簡潔かつ具体的に記述します。数値・固有名詞を優先し、過度な煽りを避けます。",
    // 構成
    "媒体と目的に応じて、ヘッドライン→概要→ベネフィット→根拠/比較→FAQ→CTAの流れで整理します。見出しは最大H2、箇条書きは3〜7項目を目安とします。",
    // SEO
    "不自然なキーワード羅列を禁止し、共起語・言い換え・上位語を自然に埋め込みます。タイトルは目安32字、説明文は80〜120字を参考にします（厳密ではありません）。",
    // CTA原則
    "一次CTAは主目的に直結（購入/カート/申込など）。二次CTAは低負荷行動（お気に入り/比較/レビュー閲覧など）。CTA文は動詞起点＋利益提示＋不安低減要素を含めます。",
    // ブランド
    "落ち着いた知性を保ち、ユーザー原稿を否定しない語調にします。過剰な絵文字や擬声語は使用しません。",
    // 禁則
    "医薬的効能の断定、根拠のないNo.1表現、誇大広告、記号乱用を抑制してください。",
    // 出力契約（強化）
    "本文は完成文として出力し、必要に応じて見出しや箇条書きを用います。最後にCTA文を1〜3案示します。",
    "【出力契約】必ず本文末尾に「一次CTA」と「代替CTA」をそれぞれ1行で明示してください（例：一次CTA：今すぐ購入—30日返品可／代替CTA：詳細を見る—レビューで比較）。",
    // 追加厳格条件
    "【厳格条件】感嘆符（！）は使用しません。FAQは必ず2〜3問（誤解/相性/返品など）をQ/A形式で含めます。数値・単位（g, mm, mAh, ms, SPF/PA, 抽出量など）は最低2つ含めます。",
    // 最終
    "語尾の重複、誤変換、冗長な反復、記号の不整合を最終確認して簡潔に整えます。",
  ];

  return modules.join("\n\n");
}

/* =========================
   Few-shot（WRITER_FEWSHOT=1/true時）
========================= */
function buildFewShot(category: string): { role: "user" | "assistant"; content: string }[] {
  if (!/^(1|true)$/i.test(String(process.env.WRITER_FEWSHOT ?? ""))) return [];
  const shots: { role: "user" | "assistant"; content: string }[] = [];

  // 家電
  if (/(家電|electronic|電動|掃除機|冷蔵庫|イヤホン|ヘッドホン)/i.test(category ?? "")) {
    shots.push(
      {
        role: "user",
        content:
          "【カテゴリ:家電】product_name: ノイズキャンセリング完全ワイヤレスイヤホン / goal: 購入誘導 / audience: 通勤・リモートワーク / keywords: 連続再生, 低遅延, 高音質",
      },
      {
        role: "assistant",
        content:
          "## 空間を自分の集中モードに\n通勤やオンライン会議に適したノイズキャンセリング。\n\n- 連続再生最大10時間／ケース併用で30時間\n- 低遅延（参考: 80–120ms程度）\n- IPX4相当の生活防水\n\n**FAQ**\nQ. iPhone/Android両対応？\nA. はい、Bluetooth 5.3に対応します。\n\n一次CTA：今すぐ購入—30日返品可\n代替CTA：詳細を見る—レビューで比較",
      }
    );
  }
  // コスメ
  if (/(コスメ|化粧|美容|スキンケア|beauty|cosme)/i.test(category ?? "")) {
    shots.push(
      {
        role: "user",
        content:
          "【カテゴリ:コスメ】product_name: 低刺激UVミルク / goal: 購入誘導 / audience: 敏感肌 / keywords: 日焼け止め, 乳液, トーンアップ",
      },
      {
        role: "assistant",
        content:
          "## やさしく守る、毎日のUVケア\n白浮きしにくい乳液テクスチャ。石けんオフ対応。\n\n- SPF50+・PA++++\n- 1回の使用量目安：パール粒2個分（約0.8g）\n- 紫外線吸収剤フリー\n\n**FAQ**\nQ. 敏感肌でも使えますか？\nA. パッチテスト済みですが、すべての方に刺激がないわけではありません。\nQ. 石けんで落ちますか？\nA. はい、単体使用時は洗顔料で落とせます。\n\n一次CTA：今すぐ購入—初回送料無料\n代替CTA：詳細を見る—成分表を確認",
      }
    );
  }
  // 食品
  if (/(食品|フード|グルメ|スイーツ|food|gourmet|菓子|コーヒー|茶)/i.test(category ?? "")) {
    shots.push(
      {
        role: "user",
        content:
          "【カテゴリ:食品】product_name: プレミアムドリップコーヒー 10袋 / goal: 購入誘導 / audience: 在宅ワーク / keywords: 香り, 深煎り, 手軽",
      },
      {
        role: "assistant",
        content:
          "## 仕事の合間に、淹れたてのご褒美\n1杯ずつ個包装のドリップタイプ。\n\n- 1杯あたり10–12gの粉量でしっかりコク\n- 焙煎後24時間以内に充填（鮮度管理）\n- お湯150–180mlが目安\n\n**FAQ**\nQ. ミルクとの相性は？\nA. 深煎りのためラテでも香りが活きます。\nQ. 賞味期限は？\nA. 未開封で製造から約12か月が目安です。\n\n一次CTA：今すぐ購入—定期便はスキップ可\n代替CTA：詳細を見る—レビューで比較",
      }
    );
  }

  return shots;
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
    n.keywords.length ? `keywords: ${n.keywords.join(", ")}` : null,
    n.constraints.length ? `constraints: ${n.constraints.join(", ")}` : null,
    n.brand_voice ? `brand_voice: ${n.brand_voice}` : null,
    n.tone ? `tone: ${n.tone}` : null,
    n.style ? `style: ${n.style}` : null,
    n.length_hint ? `length_hint: ${n.length_hint}` : null,
    n.selling_points.length ? `selling_points: ${n.selling_points.join(" / ")}` : null,
    n.objections.length ? `objections: ${n.objections.join(" / ")}` : null,
    n.evidence.length ? `evidence: ${n.evidence.join(" / ")}` : null,
    n.cta_preference.length ? `cta_preference: ${n.cta_preference.join(" / ")}` : null,
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
function extractMeta(text: string): { style: string; tone: string; locale: string } {
  const t = (text || "").trim();
  const lines = t.split(/\r?\n/);

  const bulletCount = lines.filter((l) => /^[\-\*\u30fb・]/.test(l.trim())).length;
  const h2Count = lines.filter((l) => /^##\s/.test(l.trim())).length;
  const charCount = t.length;

  let style = "summary";
  if (bulletCount >= 2) style = "bullet";
  else if (h2Count >= 2 || charCount > 500) style = "detail";

  // tone：敬体優先→neutral
  return { style, tone: "neutral", locale: "ja-JP" };
}

/* =========================
   Post Process（後処理：正規化）
========================= */
function postProcess(raw: string, n: NormalizedInput): string {
  let out = (raw ?? "").toString().trim();

  // 0) 感嘆符禁止：「！」→句点に変換（連続は1つに）
  out = out.replace(/！+/g, "。");

  // 1) 連続改行の正規化
  out = out.replace(/\n{3,}/g, "\n\n");

  // 2) 見出し最大H2へ丸め（###以上 → ##）
  out = out.replace(/^#{3,}\s?/gm, "## ");

  // 3) 重複CTAセクションを除去（**CTA**〜の中見出しを削る）
  out = out.replace(/\n\*\*CTA\*\*[\s\S]*?(?=\n##\s|$)/gi, "\n");

  // 4) FAQの確認：Q. 行が2未満ならパディング（安全な定型）
  const faqCount = (out.match(/^Q\.\s/gm) || []).length;
  if (faqCount < 2) {
    const pad: string[] = [];
    if (!/Q\.\s*返品|返金|保証/.test(out)) {
      pad.push("Q. 返品や返金はできますか？\nA. 受領後30日以内の未使用品は返品を承ります。詳細はストアポリシーをご確認ください。");
    }
    if (!/Q\.\s*相性|互換|対応/.test(out)) {
      pad.push("Q. 対応環境や相性はありますか？\nA. 使用環境により最適な条件が異なります。互換や条件は商品仕様をご確認ください。");
    }
    if (pad.length) {
      if (!/\*\*FAQ\*\*/.test(out)) out += `\n\n**FAQ**\n`;
      out += "\n" + pad.join("\n\n") + "\n";
    }
  }

  // 5) 数値・単位の最低2個保証（見つからない場合に一般例を追記）
  const numericHits =
    out.match(/(?:\d+(?:\.\d+)?\s?(?:g|kg|mm|cm|m|mAh|ms|時間|分|枚|袋|ml|mL|L|W|Hz|年|か月|ヶ月|ヶ月|日|回|%|％))/g) || [];
  if (numericHits.length < 2) {
    const examples = [
      "参考値：本体約120g・長さ約150mm",
      "目安：連続再生10時間・充電時間約90分",
      "例：1杯あたり10g（お湯150ml）",
      "目安：SPF50+・PA++++",
    ];
    const add = examples.slice(0, 2 - numericHits.length).join("／");
    out += `\n\n*${add}*`;
  }

  // 6) 末尾CTAの統一（必ず2行：一次/代替）
  const hasFinalCTA =
    /^一次CTA[：:]\s?.+/m.test(out) && /^代替CTA[：:]\s?.+/m.test(out); // ← mフラグ対応
  if (!hasFinalCTA) {
    const pref = (n.cta_preference && n.cta_preference.length > 0) ? n.cta_preference : ["今すぐ購入", "カートに追加", "詳細を見る"];
    const primary = pref[0] || "今すぐ購入";
    const secondary = pref[1] || pref[2] || "詳細を見る";
    const primaryLine = `一次CTA：${primary}—30日返品可`;
    const secondaryLine = `代替CTA：${secondary}—レビューで比較`;
    out = out.replace(/\s+$/, "") + `\n\n${primaryLine}\n${secondaryLine}`;
  } else {
    // 「—」の利益・不安低減が無い場合は付け足す（軽微）
    out = out.replace(/^(一次CTA：)(.+)$/gm, (_m, g1, g2) =>
      /—/.test(g2) ? `${g1}${g2}` : `${g1}${g2}—30日返品可`
    );
    out = out.replace(/^(代替CTA：)(.+)$/gm, (_m, g1, g2) =>
      /—/.test(g2) ? `${g1}${g2}` : `${g1}${g2}—レビューで比較`
    );
  }

  // 7) 長さ制限（安全）
  const MAX = 5000;
  if (out.length > MAX) {
    const slice = out.slice(0, MAX);
    const last = Math.max(slice.lastIndexOf("。"), slice.lastIndexOf("\n"));
    out = slice.slice(0, Math.max(0, last)) + "…";
  }

  return out;
}

/* =========================
   OpenAI 呼び出し補助
========================= */
async function safeText(r: Response) {
  try {
    return await r.text();
  } catch {
    return "";
  }
}

/* =========================
   Route: POST /api/writer
========================= */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as WriterRequest | null;

    const provider = (body?.provider ?? "openai").toLowerCase();
    const rawPrompt = (body?.prompt ?? "").toString();
    const model = (body?.model ?? "gpt-4o-mini").toString();
    const temperature = typeof body?.temperature === "number" ? body!.temperature : 0.7;
    const systemOverride = (body?.system ?? "").toString();

    if (!rawPrompt || rawPrompt.trim().length === 0) {
      return NextResponse.json<WriterResponseErr>(
        { ok: false, error: "prompt is required" },
        { status: 400 }
      );
    }

    // STUBモード
    if ((process.env.DEBUG_TEMPLATE_API ?? "").toLowerCase() === "stub") {
      const n = normalizeInput(rawPrompt);
      const sys = buildSystemPrompt(systemOverride);
      const userMsg = makeUserMessage(n);
      const stubText =
        `【STUB出力】次の条件で生成します（外部APIは呼びません）：\n` +
        `--- system ---\n${sys.slice(0, 400)}\n--- user ---\n${userMsg.slice(0, 400)}\n---\n` +
        `※本番ではOpenAIを呼び出します。`;

      const payload: WriterResponseOk = {
        ok: true,
        data: { text: stubText, meta: { style: "summary", tone: "neutral", locale: "ja-JP" } },
        output: stubText,
      };
      return NextResponse.json(payload, { status: 200 });
    }

    if (provider !== "openai") {
      return NextResponse.json<WriterResponseErr>(
        { ok: false, error: `unsupported provider: ${provider}` },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json<WriterResponseErr>(
        { ok: false, error: "OPENAI_API_KEY is not set" },
        { status: 500 }
      );
    }

    // 入力正規化 & メッセージ構築
    const n = normalizeInput(rawPrompt);
    const system = buildSystemPrompt(systemOverride);
    const userMessage = makeUserMessage(n);
    const fewShot = buildFewShot(n.category);

    // OpenAI Chat Completions
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature,
        messages: [
          { role: "system", content: system },
          ...fewShot,
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!resp.ok) {
      const errText = await safeText(resp);
      return NextResponse.json<WriterResponseErr>(
        {
          ok: false,
          error: `openai api error: ${resp.status} ${resp.statusText}`,
          details: errText?.slice(0, 2000) ?? "",
        },
        { status: 502 }
      );
    }

    const data = (await resp.json()) as any;
    const content = data?.choices?.[0]?.message?.content?.toString()?.trim() ?? "";
    if (!content) {
      return NextResponse.json<WriterResponseErr>(
        { ok: false, error: "empty content" },
        { status: 502 }
      );
    }

    const text = postProcess(content, n);
    const meta = extractMeta(text);

    const payload: WriterResponseOk = {
      ok: true,
      data: { text, meta },
      output: text,
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (e: any) {
    return NextResponse.json<WriterResponseErr>(
      { ok: false, error: e?.message ?? "unexpected error" },
      { status: 500 }
    );
  }
}
