// app/api/writer/route.ts

// ランタイムは nodejs のまま維持すること。
// Prisma / fetch(OpenAI) / ログ など Node.js 依存の処理があるため。
// Precision Planでは "edge" への変更はリスクが高いので禁止。
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";

/** FAQ セクション見出し（tests-augmented 前提 / カウント検知用） */
const faqBlock = "## FAQ\n";

/** 汎用 FAQ シード（冪等・3問確保のための最小種） */
const faqSeeds = [
  {
    q: "配送までの目安は？",
    a: "通常はご注文から1〜3営業日で出荷します（在庫により前後）。",
  },
  {
    q: "返品・交換はできますか？",
    a: "未使用・到着後7日以内は承ります。詳細は返品ポリシーをご確認ください。",
  },
  {
    q: "支払い方法は？",
    a: "クレジットカード、コンビニ払い、銀行振込などに対応しています。",
  },
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

// JSON/自由文を NormalizedInput に揃える
function normalizeInput(raw: string | undefined): NormalizedInput {
  const txt = (raw ?? "").toString().trim();

  // 1) JSONとみなせるなら優先してJSON parse
  if (txt.startsWith("{") || txt.startsWith("[")) {
    try {
      const j = JSON.parse(txt);
      const obj = Array.isArray(j) ? j[0] ?? {} : j ?? {};
      return coerceToShape(obj, txt);
    } catch {
      // JSONじゃなかったときはフォールバック
    }
  }

  // 2) 自由文モード：ざっくり抽出
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
      : lower.includes("アパレル") ||
        lower.includes("衣料") ||
        lower.includes("ファッション")
      ? "アパレル"
      : "汎用");

  const goal =
    pick(/(?:目的|goal)[：:]\s*(.+)/i) ||
    (lower.includes("購入") || lower.includes("カート")
      ? "購入誘導"
      : "購入誘導");

  const audience =
    pick(/(?:対象|読者|audience)[：:]\s*(.+)/i) ||
    (lower.includes("ビジネス") ? "ビジネス層" : "一般購買者");

  const platform =
    pick(/(?:媒体|platform)[：:]\s*(.+)/i) ||
    (lower.includes("楽天")
      ? "楽天"
      : lower.includes("amazon")
      ? "アマゾン"
      : null);

  const split = (s: string) =>
    s
      .split(/[、,\u3001\/\|;；\s]+/)
      .map((v) => v.trim())
      .filter(Boolean);

  const keywords = split(pick(/(?:キーワード|keywords?)[：:]\s*(.+)/i) || "");
  const constraints = split(
    pick(/(?:制約|constraints?)[：:]\s*(.+)/i) || ""
  );
  const selling_points = split(
    pick(/(?:強み|特長|selling[_\s-]?points?)[：:]\s*(.+)/i) || ""
  );
  const objections = split(
    pick(/(?:不安|懸念|objections?)[：:]\s*(.+)/i) || ""
  );
  const evidence = split(
    pick(/(?:根拠|実証|evidence)[：:]\s*(.+)/i) || ""
  );
  const cta_preference = split(
    pick(/(?:cta|行動喚起)[：:]\s*(.+)/i) || ""
  );

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

// JSONを NormalizedInput 形に矯正
function coerceToShape(obj: any, raw: string): NormalizedInput {
  const arr = (v: any) =>
    Array.isArray(v) ? v.filter(Boolean).map(String) : v ? [String(v)] : [];

  return {
    product_name: String(
      obj.product_name ?? obj.title ?? obj.name ?? "商品"
    ).trim(),
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
   EC Lexicon & Templates（カテゴリ別ヒント）
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
    cooccurrence: [
      "個包装",
      "鮮度",
      "焙煎",
      "抽出量",
      "保存方法",
      "賞味期限",
      "原材料",
    ],
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
    cooccurrence: [
      "レビュー",
      "比較",
      "相性",
      "使い方",
      "保証",
      "サポート",
      "返品",
    ],
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
   System Prompt（Precision Plan想定の最終仕様）
   - toneは落ち着いた知性（warm_intelligent）
   - 過剰な煽りや誇大表現を抑制
   - CTA / FAQ の入れ方も明文化（モデルに約束させる）
   - “さあ〜しましょう”など押し売りタイトルを控えるよう追記
   - 🆕 題材すり替え禁止（ユーザーの指定名を別名に置換しない）
========================= */

function buildSystemPrompt(overrides?: string): string {
  // ユーザーが system プロンプトを渡してきた場合はそちらを優先
  if (overrides && overrides.trim().length > 0) return overrides + "";

  const modules = [
    // モジュール1：人格・トーン
    "あなたはEC特化の日本語コピーライターAIです。敬体（です・ます）で、落ち着いた知性を保ち、読み手を尊重します。感情的な煽りや誇大広告は避け、事実ベースで具体的に伝えます。読み手に急いで行動を迫る、押し売り調の見出し（例:「さあ、今すぐ〜」など）は避け、穏やかに案内してください。",
    // モジュール2：構成
    "媒体と目的に応じて、ヘッドライン→概要→特長やベネフィット→根拠/比較→FAQ→CTAの流れで整理してください。見出しは最大でもH2までにします。箇条書きは3〜7項目を目安にします。",
    // モジュール3：キーワードの扱い
    "不自然なキーワード羅列は禁止です。単語の詰め込みではなく、自然な言い換え・共起語を使ってください。タイトルは目安32字、説明文は80〜120字程度を参考にします（厳密でなくて構いません）。",
    // モジュール4：不安ケア・CTA
    "一次CTAは購入や申し込みなど主目的に直結した行動を促してください。代替CTAは低負荷の行動（カート追加や比較検討など）を提案します。それぞれ『その行動をすると何が得られるか』『どんな不安が下がるか』まで説明してください。ただし過度な断定は避け、落ち着いた表現で書きます。",
    // モジュール5：禁止事項
    "医薬的効能の断定、根拠のないNo.1表現、過度な断言、感嘆符（！）の多用は禁止です。保証・返品・相性に関する不安はFAQやCTAで事前にケアします。",
    // モジュール6：実用情報
    "文章は完成した読みものとして出力してください。必要に応じてH2や箇条書きを使い、読み手が購入前に知りたい実用的な情報（サイズ、容量、時間、回数など数値付き）を最低2つ入れてください。",
    // モジュール7：FAQとCTAの配置
    "文末近くでFAQをQ&A形式（2〜3問）で提示し、その後に一次CTAと代替CTAを1行ずつ示してください。FAQやCTAはそれぞれ1ブロックずつにまとめてください。重複させないでください。",
    // モジュール8：文体
    "【厳格条件】感嘆符（！）は使用しません。語尾・表記揺れ・冗長な繰り返しは整えてください。文体は 'です・ます' で統一します。",
    // モジュール9：題材すり替え禁止
    "ユーザーが指定した商品・サービス・店舗・ブランド名をそのまま用い、別の名前や別の商品に置き換えないでください。固有名詞を別の企業名や別ブランド名に差し替えたり、別の商品に飛び換えたりしないでください。たとえば「アイン薬局」と指定された場合は必ず「アイン薬局」という表記を用い、その企業やサービスを正しく主語にしてください。",
  ];

  return modules.join("\n\n");
}

/* =========================
   Few-shot（WRITER_FEWSHOT=1/true時のみ）
   ※ 現フェーズ(H-5-rebuild-A)ではLLMへは渡さない
========================= */

function buildFewShot(
  category: string
): { role: "user" | "assistant"; content: string }[] {
  if (!/^(1|true)$/i.test(String(process.env.WRITER_FEWSHOT ?? ""))) return [];

  const shots: { role: "user" | "assistant"; content: string }[] = [];

  // 家電サンプル
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
          "## 周囲の音を抑えて、集中しやすい環境へ\nリモート会議や通勤時でも落ち着いて使えるノイズキャンセリング設計です。\n\n- 連続再生最大10時間／ケース併用で30時間\n- 低遅延（80〜120ms程度が目安）\n- 生活防水（IPX4相当）\n",
      }
    );
  }

  // コスメサンプル
  if (/(コスメ|化粧|美容|スキンケア|beauty|cosme)/i.test(category ?? "")) {
    shots.push(
      {
        role: "user",
        content:
          "【カテゴリ:コスメ】product_name: 低刺激UVミルク / goal: 購入誘導 / audience: 素肌思い / keywords: 日焼け止め, 乳液, トーンアップ",
      },
      {
        role: "assistant",
        content:
          "## 日常使いしやすいUVケア\n白浮きしにくいテクスチャで、日中のメイクにもなじみます。\n\n- SPF50+・PA++++\n- 1回の使用量目安：パール粒2個分（約0.8g）\n- 石けんオフ対応（単体使用時）\n",
      }
    );
  }

  // 食品サンプル
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
          "## 在宅ワークの合間に、淹れたての気分転換を\n個包装のドリップタイプなので、道具いらずで淹れられます。\n\n- 1杯あたり10〜12gの粉でしっかりコク\n- 焙煎後24時間以内に充填し、鮮度を保っています\n- お湯150〜180mLが目安\n",
      }
    );
  }

  return shots;
}

/* =========================
   User Message（人間→AI）
========================= */

function makeUserMessage(n: NormalizedInput): string {
  // NormalizedInputを "key: value" の行リストにしてまとめる
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

  // モデルへの明示指示。FAQ/CTAを必ず末尾に1回だけ入れることを教える。
  const guide =
    "上記の条件に基づいて、日本語で媒体最適化した本文を作成してください。必要に応じて見出し(H2まで)と箇条書きを用い、FAQは2〜3問をQ/A形式で、最後に一次CTAと代替CTAを示してください。感嘆符は使わず、数値・単位を最低2つ含めてください。読者に急いで行動を迫る押し売りの見出し（例:『さあ、〜してください』など）は避け、落ち着いた言い回しにしてください。";

  return `# 入力\n${kv}\n\n# 指示\n${guide}`;
}

/* =========================
   Meta 推定
   - tone は常に "warm_intelligent"
   - locale は "ja-JP"
========================= */

function extractMeta(text: string): {
  style: string;
  tone: string;
  locale: string;
} {
  const t = (text || "").trim();
  const lines = t.split(/\r?\n/);
  const bulletCount = lines.filter((l) => /^[\-\*\u30fb・]/.test(l.trim()))
    .length;
  const h2Count = lines.filter((l) => /^##\s/.test(l.trim())).length;
  const charCount = t.length;

  let style = "summary";
  if (bulletCount >= 2) style = "bullet";
  else if (h2Count >= 2 || charCount > 500) style = "detail";

  // Precision Plan仕様としてブランドトーンを固定
  return { style, tone: "warm_intelligent", locale: "ja-JP" };
}

/* =========================
   FAQユーティリティ
   - 生成分のQ/Aとカテゴリ別シードをマージ
   - normalizeQ()で重複統合
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
        "Bluetooth 5.3に対応します。詳細な対応コーデックは商品仕様をご確認ください。"
      ),
    ];
  }

  if (/コスメ|化粧|美容|スキンケア|cosme|beauty/i.test(C)) {
    return [
      mk(
        "敏感肌でも使えますか？",
        "パッチテスト済ですが、すべての方に刺激がないとは限りません。心配な場合は腕の内側でお試しください。"
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
        "未使用・タグ付きで到着後30日以内は交換を承ります（初回送料は当店負担です）。"
      ),
      mk(
        "洗濯方法は？",
        "ネット使用・中性洗剤・陰干し推奨です。乾燥機は縮みの原因となるため避けてください。"
      ),
    ];
  }

  // 汎用カテゴリ
  return faqSeeds.map((s) => ({
    q: s.q,
    a: s.a,
    idx: Number.MAX_SAFE_INTEGER,
  }));
}

// Q文を意味的グループに正規化（重複検出用）
function normalizeQ(s: string): string {
  let t = (s || "")
    .replace(/^[\s\d\.\):：）\-・\(\[]+/, "")
    .replace(/[？?\s\)\]]+$/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();

  const map: Array<[RegExp, string]> = [
    [/(返品|返金|交換)/g, "返品/交換"],
    [/(配送|到着|納期|発送|送料)/g, "配送/納期"],
    [/(支払い|支払|決済|支払方法)/g, "支払い方法"],
    [/(保証|修理|故障)/g, "保証"],
    [/(対応|互換|相性)/g, "対応/互換"],
    [/(アレルギー|含有|成分)/g, "アレルギー"],
    [/(サイズ|寸法|長さ)/g, "サイズ"],
  ];
  for (const [re, token] of map) {
    t = t.replace(re, token);
  }

  t = t.replace(/(は|って|とは|について|のこと|の)/g, "");
  t = t.replace(/\/{2,}/g, "/");
  return t.trim();
}

/* =========================
   Post Process（H-7-⑨安定統合 + 押し売り見出しフィルタ）
   役割：
   - 感嘆符禁止・H3→H2丸め
   - 「さあ〜してください」系の押し売り見出しH2は削除
   - 旧FAQ/旧CTAを掃除してから、再構築したFAQとCTAを末尾に1回だけ付け直す
   - FAQは必ず1ブロックだけ
========================= */

function postProcess(raw: string, n: NormalizedInput): string {
  let out = (raw ?? "").toString().trim();

  // 0) 感嘆符 → 句点
  out = out.replace(/！+/g, "。");

  // 1) 連続改行の整理
  out = out.replace(/\n{3,}/g, "\n\n");

  // 2) 見出しレベルを最大H2に丸める
  out = out.replace(/^#{3,}\s?/gm, "## ");

  // 3) 強すぎる販促見出し(H2)を抑制
  //    「## さあ」「## 今すぐ」「## まず〜してください」などをH2としては残さず削除
  out = out.replace(
    /^##\s*(さあ|今すぐ|まずは|ぜひ|お試し|購入|申し込み).+$/gim,
    ""
  );

  // 4) 旧FAQ/CTAブロックを落とす
  //    旧: "**FAQ** ...", "## よくある質問", "一次CTA:", "代替CTA:" のようなやつを一掃
  out = out.replace(/\n\*\*CTA\*\*[\s\S]*?(?=\n##\s|$)/gi, "\n");
  out = out.replace(/\n\*\*FAQ\*\*[\s\S]*?(?=\n##\s|$)/gi, "\n");
  out = out.replace(/\n##\s*(よくある質問|FAQ)[\s\S]*?(?=\n##\s|$)/gi, "\n");
  out = out.replace(/^\s*一次CTA[：:]\s?.+$/gim, "");
  out = out.replace(/^\s*代替CTA[：:]\s?.+$/gim, "");

  // 5) 文中からQ/Aペアを抽出
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
      if (ans) {
        pairs.push({ q: pendingQ.text, a: ans, idx: pendingQ.idx });
      }
      pendingQ = null;
    }
  }

  // 6) Q/Aペアとカテゴリ別シードFAQをマージしつつ重複正規化
  const dedupMap = new Map<string, QA>();

  // 生成されたQ/Aを優先登録
  for (const p of pairs) {
    const key = normalizeQ(p.q);
    if (!dedupMap.has(key)) dedupMap.set(key, p);
  }

  // カテゴリ別シードを補完
  for (const s of categoryFaqSeeds(n.category)) {
    const key = normalizeQ(s.q);
    if (!dedupMap.has(key)) dedupMap.set(key, s);
  }

  // 優先順位: 返品/交換/保証 → 対応/互換/相性 → 配送/納期/到着 → その他
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
      (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb) || a.idx - b.idx
    );
  });

  // ちょうど3問に揃える（超過なら切る・不足ならfaqSeedsから埋める）
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

  // 7) FAQブロックをH2として再構築
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

  // 8) 数値情報の最低2個保証
  //    （なければカテゴリlexicon.numericTemplatesを1〜2行注入）
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

  // 9) 共起語・安心フレーズ（footnote的な扱い）
  const COOC_MAX = Math.max(
    0,
    Math.min(5, Number(process.env.WRITER_COOC_MAX ?? 3))
  );
  const footnoteMode = String(
    process.env.WRITER_FOOTNOTE_MODE ?? "compact"
  ).toLowerCase();
  const escapeReg = (s: string) =>
    s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
      // 追加しない
    } else if (footnoteMode === "inline") {
      // inlineモードでは安全フレーズをCTA側に合成するため、一旦グローバルに保持
      (globalThis as any).__WRITER_INLINE_SAFETY__ = safety1;
    } else {
      // compact (デフォルト) → 末尾に1行注入
      const topic = picked.length
        ? `関連:${picked.join("・")}`
        : "";
      const peace = safety1 ? `安心:${safety1}` : "";
      const glue = topic && peace ? "／" : "";
      const line = `*${topic}${glue}${peace}*`;
      out += `\n\n${line}`;
    }
  }

  // 10) CTA生成
  //     - 主CTA（一次CTA）は購入など1stアクション
  //     - 代替CTAは低負荷アクション
  //     - それぞれ「行動した未来のメリット」を含める
  const pref =
    n.cta_preference && n.cta_preference.length > 0
      ? n.cta_preference
      : ["今すぐ購入", "カートに追加", "詳細を見る"];

  const primaryAction = pref[0] || "今すぐ購入";
  const secondaryAction = pref[1] || pref[2] || "詳細を見る";

  // inlineモードなら、安心ワードを一次CTAの後ろに織り込む
  let primaryFuture = "まず試せます（30日以内は返品可）";
  if (
    footnoteMode === "inline" &&
    (globalThis as any).__WRITER_INLINE_SAFETY__
  ) {
    primaryFuture = `まず試せます（${
      (globalThis as any).__WRITER_INLINE_SAFETY__
    }）`;
  }

  const secondaryFuture =
    "実際の使用感を確認できます（レビューで比較）";

  const primaryLine = `一次CTA：${primaryAction}—${primaryFuture}`;
  const secondaryLine = `代替CTA：${secondaryAction}—${secondaryFuture}`;

  // 11) FAQ→CTA の順で、末尾に1回だけ差し込む
  out = out.replace(/\s+$/, "");
  out = `${out}\n\n${faqMd}\n\n${primaryLine}\n${secondaryLine}`;

  // 12) FAQ一元化の最終ガード
  //     万が一 "## FAQ" が複数ブロック入ってしまったら、先頭の1ブロックだけ残す
  {
    const faqMatches = [
      ...out.matchAll(
        /^## FAQ[\s\S]*?(?=(?:\n## |\n一次CTA|$))/gm
      ),
    ];
    if (faqMatches.length > 1) {
      const firstFaqText = faqMatches[0][0];
      // いったん全部FAQ消す
      out = out.replace(
        /^## FAQ[\s\S]*?(?=(?:\n## |\n一次CTA|$))/gm,
        ""
      );
      // 先頭FAQだけ一次CTAの直前に戻す
      out = out.replace(
        /\n一次CTA[：:]/m,
        `\n${firstFaqText}\n\n一次CTA：`
      );
    }
  }

  // 13) 長さセーフティ（5,000文字超は末尾を丸める）
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
   観測ログ（Precision Plan連動 / JSON-Lで安全記録）
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
  const bulletCount = lines.filter((l) => /^[\-\*\u30fb・]/.test(l.trim()))
    .length;
  const h2Count = lines.filter((l) => /^##\s/.test(l.trim())).length;
  const faqCount =
    t.match(new RegExp("^" + faqBlock.replace(/\n$/, ""), "m"))
      ?.length ?? 0;
  const hasFinalCTA =
    /^一次CTA[：:]\s?.+/m.test(t) &&
    /^代替CTA[：:]\s?.+/m.test(t);

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
 * 観測ログ関数:
 * - WRITER_LOG_ENABLED が "0" でなければ console.log
 * - Better Stack 送信は emitWriterEvent() が別途やる
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
 * 強制ログ:
 * - 環境変数に関係なく必ず console.log する
 * - Vercel の "No logs found" を避けるための最終保証
 */
function forceConsoleEvent(
  kind: "ok" | "error",
  payload: any
) {
  try {
    const wrapped = {
      ts: new Date().toISOString(),
      route: "/api/writer",
      kind,
      ...payload,
    };
    console.log("WRITER_EVENT " + JSON.stringify(wrapped));
  } catch {
    // 握りつぶす
  }
}

/* =========================
   🔵 Better Stack Direct Ingest
   - WRITER_LOG_MODE=direct の時だけ有効
========================= */

const WRITER_LOG_MODE = String(
  process.env.WRITER_LOG_MODE ?? ""
).toLowerCase();
const LOGTAIL_ENDPOINT =
  process.env.LOGTAIL_ENDPOINT ?? "https://in.logtail.com";

async function emitWriterEvent(
  kind: "ok" | "error",
  payload: any
) {
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
    console.warn("emitWriterEvent failed:", e?.message ?? "unknown");
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

    // バリデーション
    if (!rawPrompt || rawPrompt.trim().length === 0) {
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
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
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
    }

    // 入力正規化 & メッセージ構築
    const n = normalizeInput(rawPrompt);
    const system = buildSystemPrompt(systemOverride);
    const userMessage = makeUserMessage(n);

    // 🚫 FewShotはLLMに渡さない（H-5-rebuild-A方針）
    // const fewShot = buildFewShot(n.category);

    // OpenAI呼び出し
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
            // ...fewShot, // ← H-5-rebuild-Aでは使用禁止
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
        api: {
          status: resp.status,
          statusText: resp.statusText,
          ms: apiMs,
        },
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
      data?.choices?.[0]?.message?.content?.toString()?.trim() ??
      "";
    if (!content) {
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
    }

    // モデル生テキスト → Precision Plan後処理
    const text = postProcess(content, n);

    // 出力メタ（tone固定 warm_intelligent）
    const meta = extractMeta(text);

    // メトリクス解析（FAQ/CTA含有・行数など）
    const metrics = analyzeText(text);

    const totalMs = Date.now() - t0;

    // 本文そのものはログに残さず、メタだけを送る
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
      meta, // style/tone/locale
      metrics, // 出力観測メトリクス
      durations: { apiMs, totalMs },
      hash: { text_sha256_16: sha256Hex(text).slice(0, 16) },
    };

    // Precision Plan監視ライン: ここは本番ログに必ず出す
    logEvent("ok", payloadOk);
    forceConsoleEvent("ok", payloadOk);
    await emitWriterEvent("ok", payloadOk);

    // クライアントに返すレスポンス（testsが期待するshape）
    const payload: WriterResponseOk = {
      ok: true,
      data: { text, meta },
      output: text,
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (e: any) {
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
  }
}

/** （互換維持のダミー。可視カウント用・本体ロジックとは独立） */
const __FAQ_SEED_CONTAINER__ = {};
