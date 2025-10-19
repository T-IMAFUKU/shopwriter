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
  ok: false,
  error: string,
  details?: string,
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
      .split(/[、,\u3001\/\|;；\s]+/).map((v) => v.trim())
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
  cooccurrence: string[];     // 共起語（自然挿入）
  numericTemplates: string[]; // カテゴリ別の数値・単位テンプレ
  safetyPhrases: string[];    // 不安低減（返品・配送・支払い等）
  faqSeeds: { q: string; a: string }[]; // カテゴリ別FAQの候補（第3問の多様化）
};
const EC_LEXICON: Record<string, ECLexicon> = {
  "家電": {
    cooccurrence: [
      "連続再生", "低遅延", "ノイズキャンセリング", "バッテリー", "充電時間",
    "防水", "Bluetooth 5", "USB-C", "保証"
    ],
    numericTemplates: [
      "連続再生：最大10時間／ケース併用で約30時間",
      "充電時間：約90分（USB-C）",
      "重量：約120g／サイズ：約150mm",
      "通信：Bluetooth 5.3／コーデック対応は商品仕様をご確認ください"
    ],
    safetyPhrases: [
      "初期不良は受領後7日以内に交換対応いたします。",
      "1年間のメーカー保証付きです（消耗品を除く）。",
      "お支払いは各種クレジット・コンビニ払いに対応しています。"
    ],
    faqSeeds: [
      { q: "防水等級はどの程度ですか？", a: "IPX4相当の生活防水です。水没は保証対象外となります。" },
      { q: "配送はどのくらいで届きますか？", a: "平日12時までのご注文は当日出荷、通常1〜3日でお届けします（地域により異なります）。" },
    ],
  },
  "コスメ": {
    cooccurrence: [
      "SPF/PA", "トーンアップ", "白浮き", "石けんオフ", "敏感肌", "無香料",
      "紫外線吸収剤フリー", "アルコールフリー"
    ],
    numericTemplates: [
      "UVカット：SPF50+・PA++++",
      "使用量目安：パール粒2個分（約0.8g）",
      "内容量：30mL／開封後は6か月を目安にお使いください"
    ],
    safetyPhrases: [
      "パッチテスト済みですが、すべての方に刺激がないわけではありません。",
      "石けんで落とせます（単体使用時）。",
      "香料・着色料フリー（※詳細は成分表をご確認ください）。"
    ],
    faqSeeds: [
      { q: "石けんで落とせますか？", a: "単体使用時は洗顔料で落とせます。ウォータープルーフ製品との重ね使いは専用リムーバーをご検討ください。" },
      { q: "白浮きしませんか？", a: "トーンアップ処方ですが、白浮きしにくい乳液テクスチャです。少量ずつなじませてください。" },
    ],
  },
  "食品": {
    cooccurrence: [
      "個包装", "鮮度", "焙煎", "抽出量", "保存方法", "賞味期限", "原材料"
    ],
    numericTemplates: [
      "1杯あたりの粉量：10–12g／お湯150–180mLが目安",
      "鮮度管理：焙煎後24時間以内に充填",
      "賞味期限：未開封で製造から約12か月（保存は直射日光を避け常温）"
    ],
    safetyPhrases: [
      "原材料にアレルギーがある方は成分表示をご確認ください。",
      "パッケージは予告なく変更される場合がありますが、中身は同一です。",
      "定期便はいつでもスキップ可能です。"
    ],
    faqSeeds: [
      { q: "賞味期限はどのくらいですか？", a: "未開封で製造から約12か月が目安です。開封後はお早めにお召し上がりください。" },
      { q: "保存方法は？", a: "直射日光・高温多湿を避け常温で保存してください。開封後は密閉容器での保存を推奨します。" },
    ],
  },
  "アパレル": {
    cooccurrence: [
      "サイズ感", "生地厚", "伸縮性", "洗濯方法", "透け感", "シルエット", "着丈"
    ],
    numericTemplates: [
      "サイズ目安：着丈68cm／身幅52cm（M）※個体差±1–2cm",
      "生地：綿100%／生地厚：5.6oz",
      "洗濯：ネット使用・中性洗剤・陰干し推奨"
    ],
    safetyPhrases: [
      "自宅での試着後でも、未使用・タグ付きであれば30日以内の返品可。",
      "色味はモニター環境により実物と異なる場合があります。",
      "サイズ交換の送料は初回1回まで当店負担です。"
    ],
    faqSeeds: [
      { q: "サイズ交換はできますか？", a: "未使用・タグ付きに限り30日以内のサイズ交換を承ります。初回1回まで送料は当店負担です。" },
      { q: "洗濯方法は？", a: "ネット使用・中性洗剤・陰干しを推奨します。色移りを避けるため単独洗いをおすすめします。" },
    ],
  },
  "汎用": {
    cooccurrence: [ "レビュー", "比較", "相性", "使い方", "保証", "サポート", "返品" ],
    numericTemplates: [
      "目安：本体約120g・長さ約150mm",
      "参考：30日返品保証／平日12時までの注文は当日出荷"
    ],
    safetyPhrases: [
      "受領後30日以内の未使用品は返品を承ります。",
      "土日祝の出荷は行っておりません（予約商品を除く）。",
      "ご不明点はチャットサポートで即時回答いたします。"
    ],
    faqSeeds: [
      { q: "配送はどのくらいで届きますか？", a: "平日12時までのご注文は当日出荷、通常1〜3日でお届けします（地域・在庫により異なります）。" },
    ],
  },
};
function pickLexicon(category: string): ECLexicon {
  if (/家電|electronic|電動|イヤホン|ヘッドホン|掃除機|冷蔵庫/i.test(category)) return EC_LEXICON["家電"];
  if (/コスメ|化粧|美容|スキンケア|cosme|beauty/i.test(category)) return EC_LEXICON["コスメ"];
  if (/食品|フード|グルメ|food|gourmet|菓子|コーヒー|茶/i.test(category)) return EC_LEXICON["食品"];
  if (/アパレル|衣料|ファッション|服|ウェア/i.test(category)) return EC_LEXICON["アパレル"];
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
    "一次CTAは主目的に直結（購入/カート/申込など）。二次CTAは低負荷行動（お気に入り/比較/レビュー閲覧など）。CTA文は動詞起点＋利益提示＋不安低減要素を含めます。",
    "落ち着いた知性を保ち、ユーザー原稿を否定しない語調にします。過剰な絵文字や擬声語は使用しません。",
    "医薬的効能の断定、根拠のないNo.1表現、誇大広告、記号乱用を抑制してください。",
    "本文は完成文として出力し、必要に応じて見出しや箇条書きを用います。最後にCTA文を1〜3案示します。",
    "【出力契約】必ず本文末尾に「一次CTA」と「代替CTA」をそれぞれ1行で明示してください（例：一次CTA：今すぐ購入—30日返品可／代替CTA：詳細を見る—レビューで比較）。",
    "【厳格条件】感嘆符（！）は使用しません。FAQは必ず2〜3問（誤解/相性/返品など）をQ/A形式で含めます。数値・単位（g, mm, mAh, ms, SPF/PA, 抽出量など）は最低2つ含めます。",
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

  if (/(家電|electronic|電動|掃除機|冷蔵庫|イヤホン|ヘッドホン)/i.test(category ?? "")) {
    shots.push(
      { role: "user", content: "【カテゴリ:家電】product_name: ノイズキャンセリング完全ワイヤレスイヤホン / goal: 購入誘導 / audience: 通勤・リモートワーク / keywords: 連続再生, 低遅延, 高音質" },
      { role: "assistant", content: "## 空間を自分の集中モードに\n通勤やオンライン会議に適したノイズキャンセリング。\n\n- 連続再生最大10時間／ケース併用で30時間\n- 低遅延（参考: 80–120ms程度）\n- IPX4相当の生活防水\n\n**FAQ**\nQ. iPhone/Android両対応？\nA. はい、Bluetooth 5.3に対応します。\n\n一次CTA：今すぐ購入—30日返品可\n代替CTA：詳細を見る—レビューで比較" }
    );
  }
  if ((/(コスメ|化粧|美容|スキンケア|beauty|cosme)/i).test(category ?? "")) {
    shots.push(
      { role: "user", content: "【カテゴリ:コスメ】product_name: 低刺激UVミルク / goal: 購入誘導 / audience: 敏感肌 / keywords: 日焼け止め, 乳液, トーンアップ" },
      { role: "assistant", content: "## やさしく守る、毎日のUVケア\n白浮きしにくい乳液テクスチャ。石けんオフ対応。\n\n- SPF50+・PA++++\n- 1回の使用量目安：パール粒2個分（約0.8g）\n- 紫外線吸収剤フリー\n\n**FAQ**\nQ. 敏感肌でも使えますか？\nA. パッチテスト済みですが、すべての方に刺激がないわけではありません。\nQ. 石けんで落ちますか？\nA. はい、単体使用時は洗顔料で落とせます。\n\n一次CTA：今すぐ購入—初回送料無料\n代替CTA：詳細を見る—成分表を確認" }
    );
  }
  if (/(食品|フード|グルメ|スイーツ|food|gourmet|菓子|コーヒー|茶)/i.test(category ?? "")) {
    shots.push(
      { role: "user", content: "【カテゴリ:食品】product_name: プレミアムドリップコーヒー 10袋 / goal: 購入誘導 / audience: 在宅ワーク / keywords: 香り, 深煎り, 手軽" },
      { role: "assistant", content: "## 仕事の合間に、淹れたてのご褒美\n1杯ずつ個包装のドリップタイプ。\n\n- 1杯あたり10–12gの粉量でしっかりコク\n- 焙煎後24時間以内に充填（鮮度管理）\n- お湯150–180mlが目安\n\n**FAQ**\nQ. ミルクとの相性は？\nA. 深煎りのためラテでも香りが活きます。\nQ. 賞味期限は？\nA. 未開封で製造から約12か月が目安です。\n\n一次CTA：今すぐ購入—定期便はスキップ可\n代替CTA：詳細を見る—レビューで比較" }
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

  return { style, tone: "neutral", locale: "ja-JP" };
}

/* =========================
   Post Process（正規化＋EC拡張・FAQ重複根絶＆3問保証）
========================= */
function postProcess(raw: string, n: NormalizedInput): string {
  let out = (raw ?? "").toString().trim();

  // 0) 感嘆符禁止：「！」→句点
  out = out.replace(/！+/g, "。");

  // 1) 連続改行の正規化
  out = out.replace(/\n{3,}/g, "\n\n");

  // 2) 見出し最大H2へ丸め
  out = out.replace(/^#{3,}\s?/gm, "## ");

  /* ==== 先に FAQ の Q/A を抽出（削除より先） ==== */
  type QA = { q: string; a: string; idx: number };
  const lines = out.split(/\r?\n/);

  const qRe = /^(?:Q(?:\s*|\.)|Q\s*\d+[\.\)：:）]|Q\d+[\.\)：:）]|Q[：:．．\)]|Q[0-9]*[：:.\)])\s*(.+)$/i;
  const aRe = /^(?:A(?:\s*|\.)|A\s*\d+[\.\)：:）]|A\d+[\.\)：:）]|A[：:．．\)]|A[0-9]*[：:.\)])\s*(.+)$/i;

  const pairs: QA[] = [];
  let pendingQ: { text: string; idx: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const L = lines[i].trim();
    const qm = qRe.exec(L);
    if (qm) { pendingQ = { text: qm[1].trim(), idx: i }; continue; }
    const am = aRe.exec(L);
    if (am && pendingQ) {
      const ans = am[1].trim();
      if (ans) pairs.push({ q: pendingQ.text, a: ans, idx: pendingQ.idx });
      pendingQ = null;
    }
  }

  // 3) 既存の FAQ/CTA セクションを完全に除去してから再構築
  // - 「**FAQ** …」形式
  out = out.replace(/\n\*\*FAQ\*\*[\s\S]*?(?=(?:\n##\s|^一次CTA|^代替CTA|$))/gim, "\n");
  // - 「## FAQ」見出し〜次の見出し/CTAまで
  out = out.replace(/^##\s*FAQ[\s\S]*?(?=(?:^##\s|^一次CTA|^代替CTA|$))/gim, "");
  // - 旧CTAブロック（念のため）
  out = out.replace(/^(\s*\*\*CTA\*\*[\s\S]*?)$/gim, "");

  // 4) FAQ 正規化・重複排除
  const normalizeQ = (s: string) =>
    s.replace(/^[\s\d\.\):：）\-・]+/, "")
      .replace(/[？?\s]+$/g, "")
      .replace(/\s+/g, " ")
      .toLowerCase();

  const byKey = new Map<string, QA>();
  for (const p of pairs) {
    const key = normalizeQ(p.q);
    if (!byKey.has(key)) byKey.set(key, p);
  }
  let dedup = Array.from(byKey.values());

  // 5) 必須2問（返品／相性）をパッド
  function ensurePadBase(list: QA[]): QA[] {
    const result = [...list];
    const hasReturn = result.some((p) => /(返品|返金|保証)/.test(p.q));
    const hasCompat = result.some((p) => /(対応|互換|相性)/.test(p.q));
    if (!hasReturn) {
      result.push({
        q: "返品や返金はできますか？",
        a: "受領後30日以内の未使用品は返品を承ります。詳しくはストアポリシーをご確認ください。",
        idx: Number.MAX_SAFE_INTEGER - 2,
      });
    }
    if (!hasCompat) {
      result.push({
        q: "対応環境や相性に制限はありますか？",
        a: "使用環境により最適条件が異なります。互換・対応状況は商品ページの仕様欄をご確認ください。",
        idx: Number.MAX_SAFE_INTEGER - 1,
      });
    }
    return result;
  }
  dedup = ensurePadBase(dedup);

  // 6) **必ず3問化**：カテゴリ固有FAQで埋める
  const lex = pickLexicon(n.category);
  const seeds = Array.isArray(lex.faqSeeds) && lex.faqSeeds.length ? lex.faqSeeds : EC_LEXICON["汎用"].faqSeeds;
  const seen = new Set(dedup.map((p) => normalizeQ(p.q)));
  for (const seed of seeds) {
    if (dedup.length >= 3) break;
    const key = normalizeQ(seed.q);
    if (!seen.has(key)) {
      dedup.push({ q: seed.q, a: seed.a, idx: Number.MAX_SAFE_INTEGER });
      seen.add(key);
    }
  }
  while (dedup.length < 3) {
    dedup.push({
      q: "配送はどのくらいで届きますか？",
      a: "平日12時までのご注文は当日出荷、通常1〜3日でお届けします（地域により異なります）。",
      idx: Number.MAX_SAFE_INTEGER,
    });
  }

  // 7) 表示順（返品→相性→カテゴリ固有）
  const priority = [
    /(返品|返金|保証)/,
    /(対応|互換|相性)/,
    /(配送|送料|納期|到着|何日|賞味期限|保存|石けんオフ|防水|サイズ交換)/,
  ];
  dedup.sort((a, b) => {
    const pa = priority.findIndex((re) => re.test(a.q));
    const pb = priority.findIndex((re) => re.test(b.q));
    return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb) || a.idx - b.idx;
  });
  if (dedup.length > 3) dedup = dedup.slice(0, 3);

  // 8) FAQブロックを生成（句読点ノイズを除去して整形）
  const cleanHead = (s: string) =>
    s.replace(/^[QＱ]\d*[：:.\)\]〉＞】」\s]*/i, "")
     .replace(/^[\.\uFF0E\u30FB・\s]+/, "")
     .trim();
  const cleanAns = (s: string) =>
    s.replace(/^[AＡ]\d*[：:.\)\]\s]*/i, "")
     .replace(/^[\.\uFF0E\u30FB・\s]+/, "")
     .trim();

  const faqBlock =
    "## FAQ\n" +
    dedup
      .map((p) => `Q. ${cleanHead(p.q)}\nA. ${cleanAns(p.a)}`)
      .join("\n\n");

  /* ---- 数値保証（最低2つ） ---- */
  const numericHits =
    out.match(/(?:\d+(?:\.\d+)?\s?(?:g|kg|mm|cm|m|mAh|ms|時間|分|枚|袋|ml|mL|L|W|Hz|年|か月|ヶ月|日|回|%|％))/g) || [];
  if (numericHits.length < 2) {
    const addLine = `*${lex.numericTemplates.slice(0, 2 - numericHits.length).join("／")}*`;
    out += `\n\n${addLine}`;
  }

  /* ---- 共起語 濃度上限 & 脚注モード ---- */
  const COOC_MAX = Math.max(0, Math.min(5, Number(process.env.WRITER_COOC_MAX ?? 3)));
  const footnoteMode = String(process.env.WRITER_FOOTNOTE_MODE ?? "compact").toLowerCase();

  const needTerms = lex.cooccurrence.filter((kw) => !new RegExp(escapeReg(kw)).test(out));
  const picked = needTerms.slice(0, Math.min(COOC_MAX, needTerms.length));
  const safety1 = lex.safetyPhrases[0] ?? "";

  if (picked.length > 0 || safety1) {
    if (footnoteMode === "inline") {
      (globalThis as any).__WRITER_INLINE_SAFETY__ = safety1;
    } else if (footnoteMode === "compact") {
      const topic = picked.length ? `関連:${picked.join("・")}` : "";
      const peace = safety1 ? `安心:${safety1}` : "";
      const glue = topic && peace ? "／" : "";
      const line = `*${topic}${glue}${peace}*`;
      out += `\n\n${line}`;
    }
  }

  /* ---- FAQ の挿入位置：CTA直前 or 末尾 ---- */
  const hasFinalCTA = /^一次CTA[：:]\s?.+/m.test(out) && /^代替CTA[：:]\s?.+/m.test(out);
  if (hasFinalCTA) {
    out = out.replace(/(\n)(一次CTA[：:].+?\n代替CTA[：:].+?$)/ms, `\n${faqBlock}\n\n$2`);
  } else {
    out = out.replace(/\s+$/, "") + `\n\n${faqBlock}\n`;
  }

  /* ---- CTA 統一＋ inline 安心織り込み ---- */
  const hasFinalCTA2 =
    /^一次CTA[：:]\s?.+/m.test(out) && /^代替CTA[：:]\s?.+/m.test(out);
  if (!hasFinalCTA2) {
    const pref = (n.cta_preference && n.cta_preference.length > 0) ? n.cta_preference : ["今すぐ購入", "カートに追加", "詳細を見る"];
    const primary = pref[0] || "今すぐ購入";
    const secondary = pref[1] || pref[2] || "詳細を見る";
    let primaryLine = `一次CTA：${primary}—30日返品可`;
    if ((globalThis as any).__WRITER_INLINE_SAFETY__) {
      primaryLine = `一次CTA：${primary}—${(globalThis as any).__WRITER_INLINE_SAFETY__}`;
    }
    const secondaryLine = `代替CTA：${secondary}—レビューで比較`;
    out = out.replace(/\s+$/, "") + `\n\n${primaryLine}\n${secondaryLine}`;
  } else {
    out = out.replace(/^(一次CTA：)(.+)$/gm, (_m, g1, g2) => {
      const hasDash = /—/.test(g2);
      const inline = (globalThis as any).__WRITER_INLINE_SAFETY__ || "30日返品可";
      return `${g1}${hasDash ? g2 : `${g2}—${inline}`}`;
    });
    out = out.replace(/^(代替CTA：)(.+)$/gm, (_m, g1, g2) =>
      /—/.test(g2) ? `${g1}${g2}` : `${g1}${g2}—レビューで比較`
    );
  }

  // 9) 長さ制限（安全）
  const MAX = 5000;
  if (out.length > MAX) {
    const slice = out.slice(0, MAX);
    const last = Math.max(slice.lastIndexOf("。"), slice.lastIndexOf("\n"));
    out = slice.slice(0, Math.max(0, last)) + "…";
  }

  return out;
}

function escapeReg(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
