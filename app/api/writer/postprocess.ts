// app/api/writer/postprocess.ts
/**
 * Postprocess (A案)
 * - 純粋関数：生成物の「付与（FAQ/CTA/フッターなど）」は行わない
 * - 役割：崩れた体裁を最低限整える / 禁止パターン由来の妄想スペックを丸める
 * - 循環参照回避：pipeline.ts の型 import をしない（このファイルは独立）
 */

import { COMMON_BANNED_PATTERNS } from "./prompt/category-safety";

/* =========================
   妄想スペック・固有情報サニタイズ用ヘルパー
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
    patterns: ["レビュー", "口コミ", "星", "★", "ランキング", "第1位", "No.1", "ナンバーワン"],
    replacement: "好意的な評価が期待できる印象",
    wordLevel: true,
  },
  {
    // 型番・モデル・認証・受賞など（単語単体も丸めてOK）
    patterns: ["型番", "モデル", "シリーズ", "Edition", "エディション", "認証", "受賞", "アワード", "グランプリ"],
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
  { re: /最大\s*\d+\s*人まで/g, replacement: "複数人で" },
  { re: /\d+\s*人まで/g, replacement: "複数人で" },
  { re: /一度の充電で何週間も使用可能/g, replacement: "一度の充電で長時間使用可能" },
  { re: /一度の充電で数週間使用できる/g, replacement: "一度の充電で長時間使用できる" },
  { re: /何週間も使用可能/g, replacement: "長時間使用可能" },
  { re: /数千冊の書籍/g, replacement: "多くの書籍" },
  { re: /数[百千万]*冊の電子書籍/g, replacement: "多くの電子書籍" },
  { re: /\d+\s*冊の書籍/g, replacement: "多くの書籍" },
  { re: /\d+\s*インチの高解像度ディスプレイ/g, replacement: "コンパクトな高解像度ディスプレイ" },
  { re: /IPX8等級の防水機能/g, replacement: "高い防水性能" },
  {
    re: /最大\d+\s*メートルの水深でも\d+\s*分間耐えることができます/g,
    replacement: "一定の水深でも安心してお使いいただけます",
  },
];

function escapeRegLite(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * postprocessが依存して良いのは「最小限のコンテキスト」だけ。
 * pipeline.ts の型は import しない（循環参照を構造で排除）
 */
export type PostprocessContext = {
  _raw?: unknown;
  product_name?: unknown;
  category?: unknown;
  goal?: unknown;
  keywords?: unknown;
  selling_points?: unknown;
  evidence?: unknown;
  constraints?: unknown;
  meta?: { template?: unknown; cta?: unknown } | unknown;
  platform?: unknown;
  cta_preference?: unknown;
  [k: string]: unknown;
};

function buildInputSpecHaystack(n: PostprocessContext | undefined): string {
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

  if (!n) return "";

  // 元の依頼＋主要フィールドを対象にする
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
 */
function maskHallucinatedSpecs(out: string, n: PostprocessContext | undefined): MaskResult {
  const inputLower = buildInputSpecHaystack(n);
  const outLower = (out ?? "").toString().toLowerCase();

  if (!outLower) return { text: out, removedPatterns: [] };

  const suspicious: string[] = [];

  for (const rawPattern of COMMON_BANNED_PATTERNS) {
    const p = rawPattern.toLowerCase().trim();
    if (!p) continue;

    const inInput = inputLower.includes(p);
    const inOut = outLower.includes(p);
    if (!inInput && inOut) suspicious.push(rawPattern);
  }

  let text = out;
  const extraRemoved: string[] = [];

  // COMMON_BANNED_PATTERNS ベースのサニタイズ
  if (suspicious.length > 0) {
    for (const group of SPEC_SANITIZE_GROUPS) {
      const targetPatterns = group.patterns.filter((p) => suspicious.includes(p));
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
      if (inputLower.includes(key)) return m;
      extraRemoved.push(m);
      return rule.replacement;
    });
  }

  const unique = Array.from(new Set([...suspicious, ...extraRemoved]));
  return { text, removedPatterns: unique };
}

/* =========================
   extractMeta / analyzeText（観測用）
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
  const bulletCount = lines.filter((l) => /^[\-\*\u30fb・]/.test(l.trim())).length;
  const h2Count = lines.filter((l) => /^##\s/.test(l.trim())).length;
  const charCount = t.length;

  let style = "summary";
  if (bulletCount >= 2) style = "bullet";
  else if (h2Count >= 2 || charCount > 500) style = "detail";

  return { style, tone: toneKey || "warm_intelligent", locale: "ja-JP" };
}

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
  const bulletCount = lines.filter((l) => /^[\-\*\u30fb・]/.test(l.trim())).length;
  const h2Count = lines.filter((l) => /^##\s/.test(l.trim())).length;

  // postprocessは付与しないが、既存出力に残っていないかの監視のためカウントだけ残す
  const faqCount = (t.match(/^##\s*FAQ\b/gm) ?? []).length;

  // 既存出力に混入していないかの監視
  const hasFinalCTA = /^一次CTA[：:]\s?.+/m.test(t) && /^代替CTA[：:]\s?.+/m.test(t);

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
   applyPostprocess（純粋整形）
========================= */

function resolveTemplateKey(n: PostprocessContext | undefined): string {
  const metaTemplate = (n as any)?.meta?.template;
  const platform = (n as any)?.platform;
  const raw = (metaTemplate ?? platform ?? "").toString().trim().toLowerCase();
  return raw;
}

function isSnsLikeTemplate(templateKey: string): boolean {
  return /sns/.test(templateKey) || /sns_short/.test(templateKey);
}

function stripInjectedBlocks(out: string): string {
  // 既存の疑似見出し/FAQ/CTAブロックをクリア（上流に責務移管するため、ここでは必ず除去）
  let t = out;

  t = t.replace(/\n\*\*CTA\*\*[\s\S]*?(?=\n##\s|$)/gi, "\n");
  t = t.replace(/\n\*\*FAQ\*\*[\s\S]*?(?=\n##\s|$)/gi, "\n");

  // 見出しとしてのFAQ
  t = t.replace(/\n##\s*(よくある質問|ご質問|FAQ)[\s\S]*?(?=\n##\s|$)/gi, "\n");

  // 最終CTA（一次/代替CTA）行
  t = t.replace(/^\s*一次CTA[：:]\s?.+$/gim, "");
  t = t.replace(/^\s*代替CTA[：:]\s?.+$/gim, "");

  return t;
}

function stripQAInline(out: string): string {
  // 本文中にQ/Aが混ざって崩れるのを抑える（FAQ付与は上流へ）
  const lines = out.split(/\r?\n/);
  const qRe =
    /^(?:Q(?:\s*|\.)|Q\s*\d+[\.\)：:）]|Q\d+[\.\)：:）]|Q[：:．．\)]|Q[0-9]*[：:.\)])\s*(.+)$/i;
  const aRe =
    /^(?:A(?:\s*|\.)|A\s*\d+[\.\)：:）]|A\d+[\.\)：:）]|A[：:．．\)]|A[0-9]*[：:.\)])\s*(.+)$/i;

  const removeIdx = new Set<number>();
  let pendingQ: number | null = null;

  for (let i = 0; i < lines.length; i++) {
    const L = lines[i].trim();
    const qm = qRe.exec(L);
    if (qm) {
      pendingQ = i;
      removeIdx.add(i);
      continue;
    }
    const am = aRe.exec(L);
    if (am && pendingQ !== null) {
      removeIdx.add(i);
      pendingQ = null;
      continue;
    }
  }

  return lines
    .map((l, i) => (removeIdx.has(i) ? "" : l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * 日本語の“謎スペース”を最小限だけ除去する
 * - 例: 「専 門」「日 々」「インターフェース により」
 * - ただし英数字(Precision Plan / AI など)の連結は壊さない
 */
function normalizeJapaneseWeirdSpaces(text: string): string {
  let t = text;

  // 1) 全角スペースを半角へ
  t = t.replace(/\u3000/g, " ");

  // 2) 日本語文字同士の間のスペースだけ除去
  //    ひらがな/カタカナ/漢字/々/ー/・/長音などを広めにカバー
  const jp = "[\\u3040-\\u309F\\u30A0-\\u30FF\\u4E00-\\u9FFF\\u3400-\\u4DBF々ー・]";
  const reJpBetweenSpaces = new RegExp(`(${jp})\\s+(${jp})`, "g");
  t = t.replace(reJpBetweenSpaces, "$1$2");

  // 3) 句読点の前後の余計なスペースを整理
  t = t.replace(/\s+([。．，、：:；;！？!?\)）\]】」』])/g, "$1");
  t = t.replace(/([（\(「『【\[])\s+/g, "$1");

  // 4) 行頭/行末のスペースを整理
  t = t
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+$/g, "").replace(/^[ \t]+/g, ""))
    .join("\n");

  return t;
}

export function applyPostprocess(raw: string, n?: PostprocessContext): string {
  let out = (raw ?? "").toString().trim();

  const templateKey = resolveTemplateKey(n);
  const isSNS = isSnsLikeTemplate(templateKey);

  // 記号・空行・見出しレベルの整理（崩れにくい最低限）
  out = out.replace(/！+/g, "。");
  out = out.replace(/\n{3,}/g, "\n\n");
  out = out.replace(/^#{3,}\s?/gm, "## ");

  // 押し売り見出しの除去
  out = out.replace(/^##\s*(さあ|今すぐ|まずは|ぜひ|お試し|購入|申し込み).+$/gim, "");

  // 上流に移した“付与”系をここでは必ず取り除く（CTA OFF事故の温床を消す）
  out = stripInjectedBlocks(out);

  // 本文のQ/A混入を抑える（FAQは上流で必要な場合のみ付与）
  out = stripQAInline(out);

  // 妄想スペック・固有情報の簡易サニタイズ
  {
    const masked = maskHallucinatedSpecs(out, n);
    out = masked.text;
  }

  // 表現トーンの最終微調整（日本語ネイティブ寄り）
  out = out.replace(/アイコン的存在/g, "象徴的な存在");
  out = out.replace(/アイコンとして広く知られている/g, "象徴的な存在として広く知られています");

  // ✅ 最後に“謎スペース”だけ整える（data.text / output の完全一致を狙う）
  out = normalizeJapaneseWeirdSpaces(out);

  // SNS向け：短文前提なので過剰な改変はしない（丸めのみ）
  const MAX = 5000;
  if (out.length > MAX) {
    const slice = out.slice(0, MAX);
    const last = Math.max(slice.lastIndexOf("。"), slice.lastIndexOf("\n"));
    out = slice.slice(0, Math.max(0, last)) + "…";
  }

  // 最終トリム
  out = out.replace(/\s+$/, "");

  // SNS/非SNSでの分岐は将来拡張の余地だけ残す（現時点の挙動差は最小）
  if (isSNS) return out;
  return out;
}

/* =========================
   postProcess（レガシー別名）
========================= */

export function postProcess(raw: string, n?: PostprocessContext): string {
  return applyPostprocess(raw, n);
}
