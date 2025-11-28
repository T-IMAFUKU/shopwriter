// app/api/writer/postprocess.ts
import type { NormalizedInput } from "./pipeline";
import {
  faqSeeds,
  EC_LEXICON,
  categoryFaqSeeds,
  normalizeQ,
  type QA,
  type ECLexicon,
} from "./faq-lexicon";
import { COMMON_BANNED_PATTERNS } from "./prompt/category-safety";

const faqBlock = "## FAQ\n";

/* =========================
   妄想スペック・固有情報サニタイズ用ヘルパー
   - input に含まれない COMMON_BANNED_PATTERNS を
     出力テキストからやわらかい表現に置き換える
   - 数値＋単位やレビュー/ランキング系の語だけを丸める
   - 「最大8人」「何週間も使用可能」「数千冊の電子書籍」など
     製品固有スペック寄りの表現も追加ルールで丸める
========================= */

type SpecSanitizeGroup = {
  patterns: string[];
  replacement: string;
  /** 単語単体も置き換えるか（true: レビュー/ランキング系のみ） */
  wordLevel: boolean;
};

const SPEC_SANITIZE_GROUPS: SpecSanitizeGroup[] = [
  {
    // 容量・重量・長さなど（数値＋単位だけサニタイズ）
    patterns: ["ml", "mL", "g", "kg", "mg", "L", "ℓ", "mm", "cm", "m"],
    replacement: "十分な量・サイズ感",
    wordLevel: false,
  },
  {
    // ストレージ・解像度・性能（数値＋単位だけ）
    patterns: ["GB", "TB", "MB", "dpi", "K対応", "4K", "8K"],
    replacement: "必要な性能を備えた仕様",
    wordLevel: false,
  },
  {
    // 価格・割引・ポイント（数値＋単位だけ）
    patterns: ["円", "割引", "OFF", "ポイント還元", "キャッシュバック"],
    replacement: "お得に感じられる条件",
    wordLevel: false,
  },
  {
    // パーセンテージ（数値＋%系のみ）
    patterns: ["%", "％"],
    replacement: "十分な水準",
    wordLevel: false,
  },
  {
    // レビュー・ランキング系（単語単体もそのまま丸めて良い）
    patterns: [
      "レビュー",
      "口コミ",
      "星",
      "★",
      "ランキング",
      "第1位",
      "No.1",
      "ナンバーワン",
    ],
    replacement: "好意的な評価が期待できる印象",
    wordLevel: true,
  },
  {
    // 型番・モデル・認証・受賞など（単語単体も丸めてOK）
    patterns: [
      "型番",
      "モデル",
      "シリーズ",
      "Edition",
      "エディション",
      "認証",
      "受賞",
      "アワード",
      "グランプリ",
    ],
    replacement: "信頼感のある仕様・背景",
    wordLevel: true,
  },
];

type ExtraNumericSanitizeRule = {
  re: RegExp;
  replacement: string;
};

/**
 * COMMON_BANNED_PATTERNS では表現しづらい、
 * 「最大8人」「何週間も使用可能」「数千冊の電子書籍」などの数字＋単位を
 * より一般的な表現に丸めるための追加ルール
 */
const EXTRA_NUMERIC_SANITIZE_RULES: ExtraNumericSanitizeRule[] = [
  {
    // プレイ人数（最大8人まで→複数人で）
    re: /最大\s*\d+\s*人まで/g,
    replacement: "複数人で",
  },
  {
    // より汎用的な「〜人まで」
    re: /\d+\s*人まで/g,
    replacement: "複数人で",
  },
  {
    // 期間：一度の充電で何週間も使用可能 → 一度の充電で長時間使用可能
    re: /一度の充電で何週間も使用可能/g,
    replacement: "一度の充電で長時間使用可能",
  },
  {
    // 期間：一度の充電で数週間使用できる → 一度の充電で長時間使用できる
    re: /一度の充電で数週間使用できる/g,
    replacement: "一度の充電で長時間使用できる",
  },
  {
    // 期間：何週間も使用可能 → 長時間使用可能
    re: /何週間も使用可能/g,
    replacement: "長時間使用可能",
  },
  {
    // 冊数：数千冊の書籍 → 多くの書籍
    re: /数千冊の書籍/g,
    replacement: "多くの書籍",
  },
  {
    // 冊数：数○○冊の電子書籍 → 多くの電子書籍
    re: /数[百千万]*冊の電子書籍/g,
    replacement: "多くの電子書籍",
  },
  {
    // 冊数（数値＋冊）：○冊の書籍 → 多くの書籍
    re: /\d+\s*冊の書籍/g,
    replacement: "多くの書籍",
  },
  {
    // ディスプレイサイズ：6インチの高解像度ディスプレイ → コンパクトな高解像度ディスプレイ
    re: /\d+\s*インチの高解像度ディスプレイ/g,
    replacement: "コンパクトな高解像度ディスプレイ",
  },
  {
    // 防水等級：IPX8等級の防水機能 → 高い防水性能
    re: /IPX8等級の防水機能/g,
    replacement: "高い防水性能",
  },
  {
    // 防水スペック：最大2メートルの水深でも30分間耐えることができます → 一定の水深でも安心してお使いいただけます
    re: /最大\d+\s*メートルの水深でも\d+\s*分間耐えることができます/g,
    replacement: "一定の水深でも安心してお使いいただけます",
  },
];

function escapeRegLite(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildInputSpecHaystack(n: NormalizedInput): string {
  const segments: string[] = [];

  const pushSeg = (v: unknown) => {
    if (!v) return;
    if (Array.isArray(v)) {
      for (const item of v) {
        const s = (item ?? "").toString().trim();
        if (s) segments.push(s);
      }
      return;
    }
    const s = (v ?? "").toString().trim();
    if (s) segments.push(s);
  };

  // P2-3 と同様、元の依頼＋主要フィールドを対象にする
  pushSeg((n as any)._raw);
  pushSeg((n as any).product_name);
  pushSeg((n as any).category);
  pushSeg((n as any).goal);
  pushSeg((n as any).keywords);
  pushSeg((n as any).selling_points);
  pushSeg((n as any).evidence);
  pushSeg((n as any).constraints);

  return segments.join(" ").toLowerCase();
}

type MaskResult = {
  text: string;
  removedPatterns: string[];
};

/**
 * 出力テキストから「入力に存在しない推測スペック」をやわらかくサニタイズする
 * - COMMON_BANNED_PATTERNS のうち、input に無くて output にだけあるパターンを対象
 * - 数値＋単位は一般表現に変換
 * - レビュー/ランキング/受賞などは単語単体も丸める
 * - さらに、「最大8人」「何週間も使用可能」「数千冊の電子書籍」などのよくある固有スペック表現も
 *   EXTRA_NUMERIC_SANITIZE_RULES で丸める
 */
function maskHallucinatedSpecs(out: string, n: NormalizedInput): MaskResult {
  const inputLower = buildInputSpecHaystack(n);
  const outLower = (out ?? "").toString().toLowerCase();

  if (!outLower) {
    return { text: out, removedPatterns: [] };
  }

  const suspicious: string[] = [];

  for (const rawPattern of COMMON_BANNED_PATTERNS) {
    const p = rawPattern.toLowerCase().trim();
    if (!p) continue;

    const inInput = inputLower.includes(p);
    const inOut = outLower.includes(p);
    if (!inInput && inOut) {
      suspicious.push(rawPattern);
    }
  }

  let text = out;
  const extraRemoved: string[] = [];

  // COMMON_BANNED_PATTERNS ベースのサニタイズ
  if (suspicious.length > 0) {
    for (const group of SPEC_SANITIZE_GROUPS) {
      const targetPatterns = group.patterns.filter((p) =>
        suspicious.includes(p),
      );
      if (targetPatterns.length === 0) continue;

      for (const pat of targetPatterns) {
        const esc = escapeRegLite(pat);

        // 「数値 + 単位」パターンを一般表現に変換
        const reNumBefore = new RegExp(`\\d+[\\d,.]*\\s*${esc}`, "gi");
        const reNumAfter = new RegExp(`${esc}\\s*\\d+[\\d,.]*`, "gi");

        text = text.replace(reNumBefore, group.replacement);
        text = text.replace(reNumAfter, group.replacement);

        // 数値を伴わない単語単体は、レビュー/ランキング/受賞系のみ丸める
        if (group.wordLevel && !/[0-9]/.test(pat)) {
          const reWord = new RegExp(esc, "gi");
          text = text.replace(reWord, group.replacement);
        }
      }
    }
  }

  // 追加の「数字＋単位」サニタイズ（COMMON_BANNED_PATTERNS 非依存）
  // - 入力に同じ表現が含まれている場合はそのまま残す
  for (const rule of EXTRA_NUMERIC_SANITIZE_RULES) {
    text = text.replace(rule.re, (m) => {
      const key = m.toLowerCase();
      if (inputLower.includes(key)) {
        return m;
      }
      extraRemoved.push(m);
      return rule.replacement;
    });
  }

  const unique = Array.from(new Set([...suspicious, ...extraRemoved]));
  return { text, removedPatterns: unique };
}

/* =========================
   EC Lexicon ピックアップ関数
   - 実体(EC_LEXICON)は faq-lexicon.ts 側に分離済み
========================= */

function pickLexicon(category: string): ECLexicon {
  if (
    /家電|electronic|電動|イヤホン|ヘッドホン|掃除機|冷蔵庫/i.test(
      category,
    )
  )
    return EC_LEXICON["家電"];
  if (
    /コスメ|化粧|美容|スキンケア|cosme|beauty/i.test(category)
  )
    return EC_LEXICON["コスメ"];
  if (
    /食品|フード|グルメ|food|gourmet|菓子|コーヒー|茶/i.test(
      category,
    )
  )
    return EC_LEXICON["食品"];
  if (/アパレル|衣料|ファッション|服|ウェア/i.test(category))
    return EC_LEXICON["アパレル"];
  return EC_LEXICON["汎用"];
}

/* =========================
   extractMeta
   - tone はプリセット解決結果を反映
   - locale は "ja-JP"
========================= */

export function extractMeta(
  text: string,
  toneKey: string,
): {
  style: string;
  tone: string;
  locale: string;
} {
  const t = (text || "").trim();
  const lines = t.split(/\r?\n/);
  const bulletCount = lines.filter((l) =>
    /^[\-\*\u30fb・]/.test(l.trim()),
  ).length;
  const h2Count = lines.filter((l) =>
    /^##\s/.test(l.trim()),
  ).length;
  const charCount = t.length;

  let style = "summary";
  if (bulletCount >= 2) style = "bullet";
  else if (h2Count >= 2 || charCount > 500) style = "detail";

  return { style, tone: toneKey || "warm_intelligent", locale: "ja-JP" };
}

/* =========================
   WriterMetrics / analyzeText
========================= */

export type WriterMetrics = {
  charCount: number;
  lineCount: number;
  bulletCount: number;
  h2Count: number;
  faqCount: number;
  hasFinalCTA: boolean;
};

export function analyzeText(text: string): WriterMetrics {
  const t = (text || "").trim();
  const lines = t.split(/\r?\n/);
  const bulletCount = lines.filter((l) =>
    /^[\-\*\u30fb・]/.test(l.trim()),
  ).length;
  const h2Count = lines.filter((l) =>
    /^##\s/.test(l.trim()),
  ).length;
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

/* =========================
   applyPostprocess（🆕 Precision正式エントリ）
========================= */

export function applyPostprocess(
  raw: string,
  n: NormalizedInput,
): string {
  let out = (raw ?? "").toString().trim();

  // 記号・空行・見出しレベルの整理
  out = out.replace(/！+/g, "。");
  out = out.replace(/\n{3,}/g, "\n\n");
  out = out.replace(/^#{3,}\s?/gm, "## ");

  // 押し売り見出しの除去
  out = out.replace(
    /^##\s*(さあ|今すぐ|まずは|ぜひ|お試し|購入|申し込み).+$/gim,
    "",
  );

  // 既存の疑似見出し/FAQ/CTAブロックをクリア
  out = out.replace(/\n\*\*CTA\*\*[\s\S]*?(?=\n##\s|$)/gi, "\n");
  out = out.replace(/\n\*\*FAQ\*\*[\s\S]*?(?=\n##\s|$)/gi, "\n");
  out = out.replace(/\n##\s*(よくある質問|ご質問|FAQ)[\s\S]*?(?=\n##\s|$)/gi, "\n");
  out = out.replace(/^\s*一次CTA[：:]\s?.+$/gim, "");
  out = out.replace(/^\s*代替CTA[：:]\s?.+$/gim, "");

  // Q/A抽出
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

  // FAQ の重複統合＋カテゴリシードマージ
  const dedupMap = new Map<string, QA>();

  for (const p of pairs) {
    const key = normalizeQ(p.q);
    if (!dedupMap.has(key)) dedupMap.set(key, p);
  }

  for (const s of categoryFaqSeeds((n as any).category)) {
    const key = normalizeQ(s.q);
    if (!dedupMap.has(key)) dedupMap.set(key, s);
  }

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

  // ⚠ 数値情報の補強ブロック（lex.numericTemplates）は削除済み

  // 共起語＆安心フレーズのフッタ追加
  const lex = pickLexicon(((n as any).category as string) || "");
  const COOC_MAX = Math.max(
    0,
    Math.min(5, Number(process.env.WRITER_COOC_MAX ?? 3)),
  );
  const footnoteMode = String(
    process.env.WRITER_FOOTNOTE_MODE ?? "compact",
  ).toLowerCase();
  const escapeReg = (s: string) =>
    s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const needTerms = lex.cooccurrence.filter(
    (kw) => !new RegExp(escapeReg(kw)).test(out),
  );
  const picked = needTerms.slice(
    0,
    Math.min(COOC_MAX, needTerms.length),
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

  // CTA の仕上げ（具体的な日数を使わない）
  const pref =
    n.cta_preference && n.cta_preference.length > 0
      ? n.cta_preference
      : ["今すぐ購入", "カートに追加", "詳細を見る"];

  const primaryAction = pref[0] || "今すぐ購入";
  const secondaryAction = pref[1] || pref[2] || "詳細を見る";

  let primaryFuture = "まず試せます（返品条件あり）";
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

  out = out.replace(/\s+$/, "");
  out = `${out}\n\n${faqMd}\n\n${primaryLine}\n${secondaryLine}`;

  // FAQ が複数重複した場合は先頭のみ残す（保険）
  {
    const faqMatches = [
      ...out.matchAll(
        /^## FAQ[\s\S]*?(?=(?:\n## |\n一次CTA|$))/gm,
      ),
    ];
    if (faqMatches.length > 1) {
      const firstFaqText = faqMatches[0][0];
      out = out.replace(
        /^## FAQ[\s\S]*?(?=(?:\n## |\n一次CTA|$))/gm,
        "",
      );
      out = out.replace(
        /\n一次CTA[：:]/m,
        `\n${firstFaqText}\n\n一次CTA：`,
      );
    }
  }

  // 妄想スペック・固有情報の簡易サニタイズ（修正版）
  {
    const masked = maskHallucinatedSpecs(out, n);
    out = masked.text;
  }

  // 表現トーンの最終微調整（日本語ネイティブ寄り）
  out = out.replace(/アイコン的存在/g, "象徴的な存在");
  out = out.replace(/アイコンとして広く知られている/g, "象徴的な存在として広く知られています");

  // 全体を 5000 文字で丸める（末尾の文 or 改行まで）
  const MAX = 5000;
  if (out.length > MAX) {
    const slice = out.slice(0, MAX);
    const last = Math.max(
      slice.lastIndexOf("。"),
      slice.lastIndexOf("\n"),
    );
    out = slice.slice(0, Math.max(0, last)) + "…";
  }

  return out;
}

/* =========================
   postProcess（レガシー別名）
========================= */

export function postProcess(
  raw: string,
  n: NormalizedInput,
): string {
  return applyPostprocess(raw, n);
}
