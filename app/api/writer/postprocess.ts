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

const faqBlock = "## FAQ\n";

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
  if (
    /アパレル|衣料|ファッション|服|ウェア/i.test(category)
  )
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
   - 旧 postProcess のロジックをそのまま移植
   - 将来 FormalOutput レイヤーをかませるための入口
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
  out = out.replace(/\n##\s*(よくある質問|FAQ)[\s\S]*?(?=\n##\s|$)/gi, "\n");
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

  for (const s of categoryFaqSeeds(n.category)) {
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

  // 数値情報の補強（最低2つ）
  const numericHits =
    out.match(
      /(?:\d+(?:\.\d+)?\s?(?:g|kg|mm|cm|m|mAh|ms|時間|分|枚|袋|ml|mL|L|W|Hz|年|か月|ヶ月|日|回|%|％))/g,
    ) || [];
  const lex = pickLexicon(n.category);
  if (numericHits.length < 2) {
    const addLine = `*${lex.numericTemplates
      .slice(0, 2 - numericHits.length)
      .join("／")}*`;
    out += `\n\n${addLine}`;
  }

  // 共起語＆安心フレーズのフッタ追加
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

  // CTA の仕上げ
  const pref =
    n.cta_preference && n.cta_preference.length > 0
      ? n.cta_preference
      : ["今すぐ購入", "カートに追加", "詳細を見る"];

  const primaryAction = pref[0] || "今すぐ購入";
  const secondaryAction = pref[1] || pref[2] || "詳細を見る";

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
   - 既存コードとの互換のため残し、中身は applyPostprocess に委譲
   - pipeline.ts などからの呼び出しはそのまま動作
========================= */

export function postProcess(
  raw: string,
  n: NormalizedInput,
): string {
  return applyPostprocess(raw, n);
}
