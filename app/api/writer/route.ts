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
   リクエスト/レスポンス型
========================= */
type WriterRequest = {
  provider?: "openai" | string;
  prompt?: string; // 自由文 or JSON
  model?: string;
  temperature?: number;
  system?: string; // 上書き可
};
type WriterResponseOk = {
  ok: true;
  data: { text: string; meta: { style: string; tone: string; locale: string } };
  output: string;
};
type WriterResponseErr = { ok: false; error: string; details?: string };

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
   EC Lexicon & Templates（拡張）
========================= */
type ECLexicon = {
  cooccurrence: string[];
  numericTemplates: string[];
  safetyPhrases: string[];
};
const EC_LEXICON: Record<string, ECLexicon> = {
  家電: {
    cooccurrence: [
      "連続再生",
      "低遅延",
      "ノイズキャンセリング",
      "バッテリー",
      "充電時間",
      "防水",
      "Bluetooth 5",
      "USB-C",
      "保証",
    ],
    numericTemplates: [
      "連続再生：最大10時間／ケース併用で約30時間",
      "充電時間：約90分（USB-C）",
      "重量：約120g／サイズ：約150mm",
      "通信：Bluetooth 5.3（対応コーデックは商品仕様をご確認ください）",
    ],
    safetyPhrases: [
      "初期不良は受領後7日以内に交換対応いたします。",
      "1年間のメーカー保証付きです（消耗品を除く）。",
      "お支払いは各種クレジット・コンビニ払いに対応しています。",
    ],
  },
  コスメ: {
    cooccurrence: [
      "SPF/PA",
      "トーンアップ",
      "白浮き",
      "石けんオフ",
      "敏感肌",
      "無香料",
      "紫外線吸収剤フリー",
      "アルコールフリー",
    ],
    numericTemplates: [
      "UVカット：SPF50+・PA++++",
      "使用量目安：パール粒2個分（約0.8g）",
      "内容量：30mL／開封後は6か月を目安",
    ],
    safetyPhrases: [
      "パッチテスト済みですが、すべての方に刺激がないわけではありません。",
      "石けんで落とせます（単体使用時）。",
      "香料・着色料フリー（詳細は成分表をご確認ください）。",
    ],
  },
  食品: {
    cooccurrence: ["個包装", "鮮度", "焙煎", "抽出量", "保存方法", "賞味期限", "原材料"],
    numericTemplates: [
      "1杯あたり粉量：10–12g／お湯150–180mLが目安",
      "鮮度管理：焙煎後24時間以内に充填",
      "賞味期限：未開封で製造から約12か月（常温保存）",
    ],
    safetyPhrases: [
      "原材料にアレルギーがある方は成分表示をご確認ください。",
      "パッケージは予告なく変更される場合があります。",
      "定期便はいつでもスキップ可能です。",
    ],
  },
  アパレル: {
    cooccurrence: [
      "サイズ感",
      "生地厚",
      "伸縮性",
      "洗濯方法",
      "透け感",
      "シルエット",
      "着丈",
    ],
    numericTemplates: [
      "サイズ目安：着丈68cm／身幅52cm（M）※個体差±1–2cm",
      "生地：綿100%／生地厚：5.6oz",
      "洗濯：ネット使用・中性洗剤・陰干し推奨",
    ],
    safetyPhrases: [
      "自宅での試着後でも、未使用・タグ付きであれば30日以内の返品可。",
      "色味はモニター環境により実物と異なる場合があります。",
      "サイズ交換の送料は初回1回まで当店負担です。",
    ],
  },
  汎用: {
    cooccurrence: ["レビュー", "比較", "相性", "使い方", "保証", "サポート", "返品"],
    numericTemplates: [
      "参考：30日返品保証／平日12時までの注文は当日出荷",
      "目安：本体約120g・長さ約150mm",
    ],
    safetyPhrases: [
      "受領後30日以内の未使用品は返品を承ります。",
      "土日祝の出荷は行っておりません（予約商品を除く）。",
      "ご不明点はチャットサポートで即時回答いたします。",
    ],
  },
};
function pickLexicon(category: string): ECLexicon {
  if (/家電|electronic|電動|イヤホン|ヘッドホン|掃除機|冷蔵庫/i.test(category))
    return EC_LEXICON["家電"];
  if (/コスメ|化粧|美容|スキンケア|cosme|beauty/i.test(category))
    return EC_LEXICON["コスメ"];
  if (/食品|フード|グルメ|food|gourmet|菓子|コーヒー|茶/i.test(category))
    return EC_LEXICON["食品"];
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
========================= */
function buildFewShot(
  category: string
): { role: "user" | "assistant"; content: string }[] {
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
          "## 空間を自分の集中モードに\n通勤やオンライン会議に適したノイズキャンセリング。\n\n- 連続再生最大10時間／ケース併用で30時間\n- 低遅延（参考: 80–120ms程度）\n- IPX4相当の生活防水\n\n## FAQ\nQ. iPhone/Android両対応？\nA. はい、Bluetooth 5.3に対応します。\n\n一次CTA：今すぐ購入—30日返品可\n代替CTA：詳細を見る—レビューで比較",
      }
    );
  }
  // コスメ
  if (/(コスメ|化粧|美容|スキンケア|beauty|cosme)/i.test(category ?? "")) {
    shots.push(
<<<<<<< HEAD
      {
        role: "user",
        content:
          "【カテゴリ:コスメ】product_name: 低刺激UVミルク / goal: 購入誘導 / audience: 素肌思い / keywords: 日焼け止め, 乳液, トーンアップ",
      },
      {
        role: "assistant",
        content:
          "## やさしく守る、毎日のUVケア\n白浮きしにくい乳液テクスチャ。石けんオフ対応。\n\n- SPF50+・PA++++\n- 1回の使用量目安：パール粒2個分（約0.8g）\n- 紫外線吸収剤フリー\n\n## FAQ\nQ. 敏感肌でも使えますか？\nA. パッチテスト済ですが、すべての方に刺激がないとは限りません。心配な場合は腕内側で試してください。\nQ. 石けんで落ちますか？\nA. はい、単体使用時は洗顔料で落とせます。重ね使い時はクレンジングをおすすめします。\n\n一次CTA：今すぐ購入—初回送料無料\n代替CTA：詳細を見る—成分表を確認",
      }
=======
      { role: "user", content: "【カテゴリ:コスメ】product_name: 低刺激UVミルク / goal: 購入誘導 / audience: 素肌思い / keywords: 日焼け止め, 乳液, トーンアップ" },
      { role: "assistant", content: "## やさしく守る、毎日のUVケア\n白浮きしにくい乳液テクスチャ。石けんオフ対応。\n\n- SPF50+・PA++++\n- 1回の使用量目安：パール粒2個分（約0.8g）\n- 紫外線吸収剤フリー\n\n## FAQ\nQ. 敏感肌でも 使えますか？\nA. パッチテスト済ですが、すべての方に刺激がないとは限りません。心配な場合は腕内側で試してください。\nQ. 石け んで落ちますか？\nA. はい、単体使用時は洗顔料で落とせます。重ね使い時はクレンジングをおすすめします。\n\n一次CTA：今すぐ購入—初回送料無料\n代替CTA：詳細を見る—成分表を確認" }
>>>>>>> 94844c12 (feat(H-7-④): force console WRITER_EVENT for production Precision monitoring)
    );
  }
  // 食品
  if (/(食品|フード|グルメ|スイーツ|food|gourmet|菓子|コーヒー|茶)/i.test(category ?? "")) {
    shots.push(
<<<<<<< HEAD
      {
        role: "user",
        content:
          "【カテゴリ:食品】product_name: プレミアムドリップコーヒー 10袋 / goal: 購入誘導 / audience: 在宅ワーク / keywords: 香り, 深煎り, 手軽",
      },
      {
        role: "assistant",
        content:
          "## 仕事の合間に、淹れたてのご褒美\n1杯ずつ個包装のドリップタイプ。\n\n- 1杯あたり10–12gの粉量でしっかりコク\n- 焙煎後24時間以内に充填（鮮度管理）\n- お湯150–180mlが目安\n\n## FAQ\nQ. ミルクとの相性は？\nA. 深煎りのためラテでも香りが活きます。\nQ. 賞味期限は？\nA. 未開封で製造から約12か月が目安です。\n\n一次CTA：今すぐ購入—定期便はスキップ可\n代替CTA：詳細を見る—レビューで比較",
      }
=======
      { role: "user", content: "【カテゴリ:食品】product_name: プレミアムドリップコーヒー 10袋 / goal: 購入誘導 / audience: 在宅ワーク / keywords: 香り, 深煎り, 手軽" },
      { role: "assistant", content: "## 仕事の合間に、淹れたてのご褒美\n1杯ずつ個包装のドリップタイプ。\n\n- 1杯あたり10–12gの粉量でしっかりコク\n- 焙煎後24時 間以内に充填（鮮度管理）\n- お湯150–180mlが目安\n\n## FAQ\nQ. ミル クとの相性は？\nA. 深煎りのためラテでも香りが活きます。\nQ. 賞味期限は？\nA. 未開封で製造から約12か月が目安です。\n\n一次CTA：今すぐ購入—定期便はスキップ可\n代替CTA：詳細を見る—レビューで比較" }
>>>>>>> 94844c12 (feat(H-7-④): force console WRITER_EVENT for production Precision monitoring)
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
    n.selling_points.length
      ? `selling_points: ${n.selling_points.join(" / ")}`
      : null,
    n.objections.length
      ? `objections: ${n.objections.join(" / ")}`
      : null,
    n.evidence.length ? `evidence: ${n.evidence.join(" / ")}` : null,
    n.cta_preference.length
      ? `cta_preference: ${n.cta_preference.join(" / ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const guide =
<<<<<<< HEAD
    "上記の条件に基づいて、日本語で媒体最適化した本文を作成してください。必要に応じて見出し(H2まで)と箇条書きを用い、FAQは2〜3問をQ/A形式で、最後に一次CTAと代替CTAを示してください。感嘆符は使わず、数値・単位を最低2つ含めてください。";
=======
    "上記の条件に基づいて、日本語で媒体最適化した本文を作成してください。必要に応じて見出し(H2まで)と箇条書きを用い、FAQは2〜3問をQ/A形式で、最後に一次CTAと代 替CTAを示してください。感嘆符は使わず、数値・単位を最低2つ含めてく ださい。";
>>>>>>> 94844c12 (feat(H-7-④): force console WRITER_EVENT for production Precision monitoring)

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
  return { style, tone: "neutral", locale: "ja-JP" };
}

/* =========================
   FAQユーティリティ（カテゴリ別シード＋同義正規化）
========================= */
type QA = { q: string; a: string; idx: number };
function categoryFaqSeeds(cat: string): QA[] {
  const C = cat || "";
  const mk = (q: string, a: string): QA => ({
    q,
    a,
    idx: Number.MAX_SAFE_INTEGER,
  });
  if (/家電|electronic|電動|イヤホン|ヘッドホン|掃除機|冷蔵庫/i.test(C)) {
    return [
      mk(
        "保証期間はどのくらいですか？",
        "メーカー保証は1年間です（消耗品を除く）。延長保証も選べます。"
      ),
      mk(
        "対応機種や互換性は？",
        "Bluetooth 5.3対応。詳細な対応コーデックは商品仕様をご確認ください。"
      ),
    ];
  }
  if (/コスメ|化粧|美容|スキンケア|cosme|beauty/i.test(C)) {
    return [
      mk(
        "敏感肌でも使えますか？",
        "パッチテスト済ですが、全ての方に刺激がないとは限りません。心配な場合は腕内側で試してください。"
      ),
      mk(
        "石けんで落ちますか？",
        "単体使用時は洗顔料で落とせます。重ね使い時はクレンジングをおすすめします。"
      ),
    ];
  }
  if (/食品|フード|グルメ|food|gourmet|菓子|コーヒー|茶/i.test(C)) {
    return [
      mk(
        "賞味期限はどのくらいですか？",
        "未開封で製造から約12か月（常温）。開封後はお早めにお召し上がりください。"
      ),
      mk(
        "アレルギー表示は？",
        "主要7品目を含むアレルギー情報を商品ページに明記しています。"
      ),
    ];
  }
  if (/アパレル|衣料|ファッション|服|ウェア/i.test(C)) {
    return [
      mk(
        "サイズ交換は可能ですか？",
        "未使用・タグ付きで到着後30日以内は交換を承ります（初回送料は当店負担）。"
      ),
      mk(
        "洗濯方法は？",
        "ネット使用・中性洗剤・陰干し推奨です。乾燥機は縮みの原因となるため避けてください。"
      ),
    ];
  }
  // 汎用
  return faqSeeds.map((s) => ({
    q: s.q,
    a: s.a,
    idx: Number.MAX_SAFE_INTEGER,
  }));
}

/** 表記ゆれ＋同義をひとつの“意味キー”へ正規化（満点仕様） */
function normalizeQ(s: string): string {
  // 前処理：前後の装飾・番号・句読点
  let t = (s || "")
    .replace(/^[\s\d\.\):：）\-・\(\[]+/, "")
    .replace(/[？?\s\)\]]+$/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();

  // 同義グループ正規化（意味で1つにまとめる）
  const map: Array<[RegExp, string]> = [
    [/(返品|返金|交換)/g, "返品/交換"],
    [/(配送|到着|納期|発送|送料)/g, "配送/納期"],
    [/(支払い|支払|決済|支払方法)/g, "支払い方法"],
    [/(保証|修理|故障)/g, "保証"],
    [/(対応|互換|相性)/g, "対応/互換"],
    [/(アレルギー|含有|成分)/g, "アレルギー"],
    [/(サイズ|寸法|長さ)/g, "サイズ"],
  ];
  for (const [re, token] of map) t = t.replace(re, token);

  // 余計な助詞を間引き（意味キーの安定化）
  t = t.replace(/(は|って|とは|について|のこと|の)/g, "");
  // 連続スラッシュの整理
  t = t.replace(/\/{2,}/g, "/");
  return t.trim();
}

/* =========================
   Post Process（H-7-⑤最終仕様）
   - FAQ一元化（常に1ブロック）
   - CTAに「行動後の具体的な変化」を必ず含める
========================= */
function postProcess(raw: string, n: NormalizedInput): string {
  let out = (raw ?? "").toString().trim();

  // 0) 感嘆符禁止：「！」→句点
  out = out.replace(/！+/g, "。");

  // 1) 連続改行の正規化
  out = out.replace(/\n{3,}/g, "\n\n");

  // 2) 見出し最大H2へ丸め
  out = out.replace(/^#{3,}\s?/gm, "## ");

  // 3) 既存 CTA/FAQ ブロックを除去（書式揺れ吸収）
  //    - 旧FAQ/CTAを消してから改めて差し込む
  out = out.replace(/\n\*\*CTA\*\*[\s\S]*?(?=\n##\s|$)/gi, "\n");
  out = out.replace(/\n\*\*FAQ\*\*[\s\S]*?(?=\n##\s|$)/gi, "\n");
  out = out.replace(/\n##\s*FAQ[\s\S]*?(?=\n##\s|$)/gi, "\n"); // 既存の H2 FAQ も除去
  out = out.replace(/^\s*一次CTA[：:]\s?.+$/gim, "");
  out = out.replace(/^\s*代替CTA[：:]\s?.+$/gim, "");

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
    const key = normalizeQ(p.q);
    if (!dedupMap.has(key)) dedupMap.set(key, p);
  }
  // シード（カテゴリ別）
  for (const s of categoryFaqSeeds(n.category)) {
    const key = normalizeQ(s.q);
    if (!dedupMap.has(key)) dedupMap.set(key, s);
  }

  // 優先度：返品/返金/保証 → 対応/互換/相性 → 配送/納期/到着 → その他
  const priority = [
    /(返品|返金|交換|保証)/,
    /(対応|互換|相性)/,
    /(配送|送料|納期|到着)/,
  ];
  let list = Array.from(dedupMap.values());
  list.sort((a, b) => {
    const pa = priority.findIndex((re) => re.test(a.q));
    const pb = priority.findIndex((re) => re.test(b.q));
    return (
      (pa === -1 ? 99 : pa) -
        (pb === -1 ? 99 : pb) ||
      a.idx - b.idx
    );
  });

  // ちょうど3問に整形（不足は汎用シードで埋める）
  if (list.length > 3) list = list.slice(0, 3);
  while (list.length < 3) {
    for (const s of faqSeeds) {
      const key = normalizeQ(s.q);
      if (!list.some((x) => normalizeQ(x.q) === key)) {
        list.push({
          q: s.q,
          a: s.a,
          idx: Number.MAX_SAFE_INTEGER,
        });
        if (list.length >= 3) break;
      }
    }
    if (list.length >= 3) break;
  }

  // FAQ ブロック（H2）
  const faqMd =
    `${faqBlock}` +
    list
      .map((p) => {
        const q = p.q
          .replace(/^[QＱ]\d*[：:.\)\]〉＞＞】】」」\s]*/i, "")
          .trim();
        const a = p.a
          .replace(/^[AＡ]\d*[：:.\)\]\s]*/i, "")
          .trim();
        return `Q. ${q}\nA. ${a}`;
      })
      .join("\n\n");

  /* ---- EC数値保証（本文ベース） ---- */
  const numericHits =
    out.match(
      /(?:\d+(?:\.\d+)?\s?(?:g|kg|mm|cm|m|mAh|ms|時間|分|枚|袋|ml|mL|L|W|Hz|年|か月|ヶ月|日|回|%|％))/g
    ) || [];
  const lex = pickLexicon(n.category);
  if (numericHits.length < 2) {
    const addLine = `*${lex.numericTemplates
      .slice(0, 2 - numericHits.length)
      .join("／")}*`;
    out += `\n\n${addLine}`;
  }

  /* ---- 共起語 濃度上限 & 表示モード ---- */
  const COOC_MAX = Math.max(
    0,
    Math.min(5, Number(process.env.WRITER_COOC_MAX ?? 3))
  );
  const footnoteMode = String(
    process.env.WRITER_FOOTNOTE_MODE ?? "compact"
  ).toLowerCase();
  const escapeReg = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const needTerms = lex.cooccurrence.filter(
    (kw) => !new RegExp(escapeReg(kw)).test(out)
  );
  const picked = needTerms.slice(
    0,
    Math.min(COOC_MAX, needTerms.length)
  );
  const safety1 = lex.safetyPhrases[0] ?? "";

  if (picked.length > 0 || safety1) {
    if (footnoteMode === "none") {
      // 何もしない
    } else if (footnoteMode === "inline") {
      (globalThis as any).__WRITER_INLINE_SAFETY__ = safety1;
    } else {
      const topic = picked.length
        ? `関連:${picked.join("・")}`
        : "";
      const peace = safety1 ? `安心:${safety1}` : "";
      const glue = topic && peace ? "／" : "";
      const line = `*${topic}${glue}${peace}*`;
      out += `\n\n${line}`;
    }
  }

  // CTA 生成用フレーズ（H-7-⑤: 行動後の未来価値を必ず明示）
  // primaryFuture: 「まず試せます（30日以内は返品可）」= 買ってもリスク低い未来
  // secondaryFuture: 「実際の使用感を確認できます（レビューで比較）」= 迷ってる人でも前進できる未来
  const pref =
    n.cta_preference && n.cta_preference.length > 0
      ? n.cta_preference
      : ["今すぐ購入", "カートに追加", "詳細を見る"];
  const primaryAction = pref[0] || "今すぐ購入";
  const secondaryAction = pref[1] || pref[2] || "詳細を見る";

  let primaryFuture =
    "まず試せます（30日以内は返品可）";
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
  out = `${out}\n\n${faqMd}\n\n${primaryLine}\n${secondaryLine}`;

  // FAQ一元化の最終ガード：
  // 万一「## FAQ」が複数混入した場合は、先頭1ブロックだけ残し後続FAQを除去
  {
    const faqMatches = [...out.matchAll(/^## FAQ[\s\S]*?(?=(?:\n## |\n一次CTA|$))/gm)];
    if (faqMatches.length > 1) {
      // keep first block text
      const firstFaqText = faqMatches[0][0];
      // remove all FAQ blocks
      out = out.replace(/^## FAQ[\s\S]*?(?=(?:\n## |\n一次CTA|$))/gm, "");
      // insert first block once before CTA again
      out = out.replace(
        /\n一次CTA[：:]/m,
        `\n${firstFaqText}\n\n一次CTA：`
      );
    }
  }

  // 長さ制限（安全）
  const MAX = 5000;
  if (out.length > MAX) {
    const slice = out.slice(0, MAX);
    const last = Math.max(
      slice.lastIndexOf("。"),
      slice.lastIndexOf("\n")
    );
    out = slice.slice(0, Math.max(0, last)) + "…";
  }

  return out;
}

/* =========================
   観測ログ（Precision Plan連動 / JSON-L）
========================= */
type WriterMetrics = {
  charCount: number;
  lineCount: number;
  bulletCount: number;
  h2Count: number;
  faqCount: number;
  hasFinalCTA: boolean;
};
function analyzeText(text: string): WriterMetrics {
  const t = (text || "").trim();
  const lines = t.split(/\r?\n/);
  const bulletCount = lines.filter((l) =>
    /^[\-\*\u30fb・]/.test(l.trim())
  ).length;
  const h2Count = lines.filter((l) => /^##\s/.test(l.trim())).length;
  const faqCount =
    t.match(new RegExp("^" + faqBlock.replace(/\n$/, ""), "m"))?.length ??
    0;
  const hasFinalCTA =
    /^一次CTA[：:]\s?.+/m.test(t) && /^代替CTA[：:]\s?.+/m.test(t);
  return {
    charCount: t.length,
    lineCount: lines.length,
    bulletCount,
    h2Count,
    faqCount,
    hasFinalCTA,
  };
}
const WRITER_LOG_ENABLED =
  String(process.env.WRITER_LOG ?? "1") !== "0";
function sha256Hex(s: string): string {
  return createHash("sha256").update(s || "").digest("hex");
}

/**
<<<<<<< HEAD
 * 観測ログ関数:
 * - WRITER_LOG_ENABLED が "0" でなければ console.log
 * - Better Stack用 emitWriterEvent() とは別
=======
 * 既存の観測ログ関数:
 * - WRITER_LOG_ENABLED が "0" でなければ console.log する
 * - Better Stack用の emitWriterEvent() とは別
>>>>>>> 94844c12 (feat(H-7-④): force console WRITER_EVENT for production Precision monitoring)
 */
function logEvent(kind: "ok" | "error", payload: any) {
  if (!WRITER_LOG_ENABLED) return;
  const wrapped = {
    ts: new Date().toISOString(),
    route: "/api/writer",
    kind,
    ...payload,
  };
  console.log("WRITER_EVENT " + JSON.stringify(wrapped));
}

/**
 * 強制ログ (本番Vercel Logsで必ず1行出すための保険)
 * - 環境変数に関係なく出す
<<<<<<< HEAD
 * - 「No logs found for this request」を潰す最終保証ライン
 */
function forceConsoleEvent(
  kind: "ok" | "error",
  payload: any
) {
=======
 * - Vercel Logsの「No logs found for this request」を潰すための最終保証ライン
 */
function forceConsoleEvent(kind: "ok" | "error", payload: any) {
>>>>>>> 94844c12 (feat(H-7-④): force console WRITER_EVENT for production Precision monitoring)
  try {
    const wrapped = {
      ts: new Date().toISOString(),
      route: "/api/writer",
      kind,
      ...payload,
    };
    console.log("WRITER_EVENT " + JSON.stringify(wrapped));
  } catch {
<<<<<<< HEAD
    // 握りつぶす
=======
    // ここでの例外は握りつぶす（本体レスポンスを壊さない）
>>>>>>> 94844c12 (feat(H-7-④): force console WRITER_EVENT for production Precision monitoring)
  }
}

/* =========================
<<<<<<< HEAD
   🔵 Better Stack Direct Ingest
========================= */
/**
 * WRITER_LOG_MODE=direct のときだけ Better Stack(HTTP Source) へPOSTする。
 * LOGTAIL_SOURCE_TOKEN: Better Stack側のSource token
 * LOGTAIL_ENDPOINT: 例 https://in.logtail.com
 */
const WRITER_LOG_MODE = String(
  process.env.WRITER_LOG_MODE ?? ""
).toLowerCase();
const LOGTAIL_ENDPOINT =
  process.env.LOGTAIL_ENDPOINT ?? "https://in.logtail.com";

async function emitWriterEvent(
  kind: "ok" | "error",
  payload: any
) {
=======
   🔵 Better Stack Direct Ingest 送信機能（追加）
========================= */

/**
 * WRITER_LOG_MODE=direct のときだけ Better Stack(HTTP Source) へPOSTする。
 * LOGTAIL_SOURCE_TOKEN: Better Stack側のSource token
 * LOGTAIL_ENDPOINT: https://sxxxxx.eu-nbg-2.betterstackdata.com 等（未設定なら https://in.logtail.com）
 */
const WRITER_LOG_MODE = String(process.env.WRITER_LOG_MODE ?? "").toLowerCase();
const LOGTAIL_ENDPOINT = process.env.LOGTAIL_ENDPOINT ?? "https://in.logtail.com";

async function emitWriterEvent(kind: "ok" | "error", payload: any) {
>>>>>>> 94844c12 (feat(H-7-④): force console WRITER_EVENT for production Precision monitoring)
  try {
    if (!WRITER_LOG_ENABLED) return;
    if (WRITER_LOG_MODE !== "direct") return;
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
<<<<<<< HEAD
    console.warn(
      "emitWriterEvent failed:",
      e?.message ?? "unknown"
    );
=======
    console.warn("emitWriterEvent failed:", e?.message ?? "unknown");
>>>>>>> 94844c12 (feat(H-7-④): force console WRITER_EVENT for production Precision monitoring)
  }
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
  const t0 = Date.now();
  try {
    const body = (await req.json()) as WriterRequest | null;

    const provider = (body?.provider ?? "openai").toLowerCase();
    const rawPrompt = (body?.prompt ?? "").toString();
    const model = (body?.model ?? "gpt-4o-mini").toString();
    const temperature =
      typeof body?.temperature === "number"
        ? body!.temperature
        : 0.7;
    const systemOverride = (body?.system ?? "").toString();

    if (!rawPrompt || rawPrompt.trim().length === 0) {
<<<<<<< HEAD
      const err = {
        ok: false,
        error: "prompt is required",
      } as const;
      const payload = {
        ok: false,
        reason: "bad_request",
        provider,
        model,
        meta: null,
      };
      logEvent("error", payload);
      forceConsoleEvent("error", payload);
      await emitWriterEvent("error", payload);
      return NextResponse.json<WriterResponseErr>(err, {
        status: 400,
      });
    }
    if (provider !== "openai") {
      const err = {
        ok: false,
        error: `unsupported provider: ${provider}`,
      } as const;
      const payload = {
        ok: false,
        reason: "unsupported_provider",
        provider,
        model,
        meta: null,
      };
      logEvent("error", payload);
      forceConsoleEvent("error", payload);
      await emitWriterEvent("error", payload);
      return NextResponse.json<WriterResponseErr>(err, {
        status: 400,
      });
=======
      const err = { ok: false, error: "prompt is required" } as const;
      const payload = { ok: false, reason: "bad_request", provider, model, meta: null };
      logEvent("error", payload);
      forceConsoleEvent("error", payload);
      await emitWriterEvent("error", payload);
      return NextResponse.json<WriterResponseErr>(err, { status: 400 });
    }
    if (provider !== "openai") {
      const err = { ok: false, error: `unsupported provider: ${provider}` } as const;
      const payload = { ok: false, reason: "unsupported_provider", provider, model, meta: null };
      logEvent("error", payload);
      forceConsoleEvent("error", payload);
      await emitWriterEvent("error", payload);
      return NextResponse.json<WriterResponseErr>(err, { status: 400 });
>>>>>>> 94844c12 (feat(H-7-④): force console WRITER_EVENT for production Precision monitoring)
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
<<<<<<< HEAD
      const err = {
        ok: false,
        error: "OPENAI_API_KEY is not set",
      } as const;
      const payload = {
        ok: false,
        reason: "missing_api_key",
        provider,
        model,
        meta: null,
      };
      logEvent("error", payload);
      forceConsoleEvent("error", payload);
      await emitWriterEvent("error", payload);
      return NextResponse.json<WriterResponseErr>(err, {
        status: 500,
      });
=======
      const err = { ok: false, error: "OPENAI_API_KEY is not set" } as const;
      const payload = { ok: false, reason: "missing_api_key", provider, model, meta: null };
      logEvent("error", payload);
      forceConsoleEvent("error", payload);
      await emitWriterEvent("error", payload);
      return NextResponse.json<WriterResponseErr>(err, { status: 500 });
>>>>>>> 94844c12 (feat(H-7-④): force console WRITER_EVENT for production Precision monitoring)
    }

    // 入力正規化 & メッセージ構築
    const n = normalizeInput(rawPrompt);
    const system = buildSystemPrompt(systemOverride);
    const userMessage = makeUserMessage(n);
    const fewShot = buildFewShot(n.category);

    const t1 = Date.now();
    const resp = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
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
      }
    );
    const apiMs = Date.now() - t1;

    if (!resp.ok) {
      const errText = await safeText(resp);
      const payload = {
        ok: false,
        reason: "openai_api_error",
        provider,
        model,
<<<<<<< HEAD
        api: {
          status: resp.status,
          statusText: resp.statusText,
          ms: apiMs,
        },
=======
        api: { status: resp.status, statusText: resp.statusText, ms: apiMs },
>>>>>>> 94844c12 (feat(H-7-④): force console WRITER_EVENT for production Precision monitoring)
      };
      logEvent("error", payload);
      forceConsoleEvent("error", payload);
      await emitWriterEvent("error", payload);
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
    const content =
      data?.choices?.[0]?.message?.content
        ?.toString()
        ?.trim() ?? "";
    if (!content) {
<<<<<<< HEAD
      const payload = {
        ok: false,
        reason: "empty_content",
        provider,
        model,
        api: { ms: apiMs },
      };
      logEvent("error", payload);
      forceConsoleEvent("error", payload);
      await emitWriterEvent("error", payload);
      return NextResponse.json<WriterResponseErr>(
        { ok: false, error: "empty content" },
        { status: 502 }
      );
=======
      const payload = { ok: false, reason: "empty_content", provider, model, api: { ms: apiMs } };
      logEvent("error", payload);
      forceConsoleEvent("error", payload);
      await emitWriterEvent("error", payload);
      return NextResponse.json<WriterResponseErr>({ ok: false, error: "empty content" }, { status: 502 });
>>>>>>> 94844c12 (feat(H-7-④): force console WRITER_EVENT for production Precision monitoring)
    }

    const text = postProcess(content, n);
    const meta = extractMeta(text);
    const metrics = analyzeText(text);
    const totalMs = Date.now() - t0;

    // 本文は保存せず、ハッシュとメトリクスのみ記録（冗長ログ防止）
    const payloadOk = {
      ok: true,
      provider,
      model,
      temperature,
      input: {
        category: n.category,
        goal: n.goal,
        platform: n.platform ?? null,
      },
      meta, // Precision Plan: style/tone/locale
      metrics, // 出力観測メトリクス
      durations: { apiMs, totalMs },
      hash: { text_sha256_16: sha256Hex(text).slice(0, 16) },
    };
<<<<<<< HEAD
=======

    // Precision監視ライン: ここで必ずログを吐く（本番Vercel Logsで見えることが目的）
    logEvent("ok", payloadOk);
    forceConsoleEvent("ok", payloadOk);
    await emitWriterEvent("ok", payloadOk);
>>>>>>> 94844c12 (feat(H-7-④): force console WRITER_EVENT for production Precision monitoring)

    // Precision監視ライン: 必ずログを吐く
    logEvent("ok", payloadOk);
    forceConsoleEvent("ok", payloadOk);
    await emitWriterEvent("ok", payloadOk);

    const payload: WriterResponseOk = {
      ok: true,
      data: { text, meta },
      output: text,
    };
    return NextResponse.json(payload, { status: 200 });
  } catch (e: any) {
<<<<<<< HEAD
    const payload = {
      ok: false,
      reason: "exception",
      message: e?.message ?? "unknown",
    };
    logEvent("error", payload);
    forceConsoleEvent("error", payload);
    await emitWriterEvent("error", payload);
    return NextResponse.json<WriterResponseErr>(
      { ok: false, error: e?.message ?? "unexpected error" },
      { status: 500 }
    );
=======
    const payload = { ok: false, reason: "exception", message: e?.message ?? "unknown" };
    logEvent("error", payload);
    forceConsoleEvent("error", payload);
    await emitWriterEvent("error", payload);
    return NextResponse.json<WriterResponseErr>({ ok: false, error: e?.message ?? "unexpected error" }, { status: 500 });
>>>>>>> 94844c12 (feat(H-7-④): force console WRITER_EVENT for production Precision monitoring)
  }
}

/** （互換維持のダミー。可視カウント用・本体ロジックとは独立） */
const __FAQ_SEED_CONTAINER__ = {};
