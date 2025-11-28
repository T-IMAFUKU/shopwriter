// app/api/writer/prompt/category-match.ts
/**
 * Phase2 P2-2-3: カテゴリ判定ユーティリティ
 *
 * 目的:
 * - category / product_name / keywords などの文字列から
 *   CATEGORY_SAFETY (category-safety.ts) に定義した CategoryKey を推定する
 * - まだどこからも強制的には使わず、「安全なヒューリスティック」として用意しておく
 *
 * 特徴:
 * - 部分一致ベースのシンプルなスコアリング
 * - スコアが 0 の場合は null を返し、無理なカテゴリ決めつけを避ける
 */

import {
  CATEGORY_SAFETY,
  type CategoryKey,
  type CategorySafetyDefinition,
} from "./category-safety";

/** カテゴリ推定に使う入力の最小形 */
export type CategoryMatchInput = {
  category?: string | null;
  productName?: string | null;
  /** 既に分割済みのキーワード群（任意） */
  keywords?: string[] | null;
};

/** カテゴリ推定結果（scoreDetail はデバッグ・ログ用） */
export type CategoryMatchResult =
  | {
      key: CategoryKey;
      label: string;
      definition: CategorySafetyDefinition;
      score: number;
      scoreDetail: {
        key: CategoryKey;
        label: string;
        score: number;
      }[];
    }
  | null;

/** シンプルな正規化: lower + trim（日本語はそのまま） */
function normalizeText(input: string | null | undefined): string {
  return (input ?? "").toString().trim().toLowerCase();
}

/** トークン分割: 空白・カンマ・読点・スラッシュなどでざっくり区切る */
function tokenize(input: string | null | undefined): string[] {
  const base = normalizeText(input);
  if (!base) return [];
  return base
    .split(/[\s、,／\/・]+/g)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** キーワード配列を一つのテキストにまとめてからトークン化する */
function tokenizeKeywords(keywords: string[] | null | undefined): string[] {
  if (!keywords || keywords.length === 0) return [];
  const joined = keywords.join(" ");
  return tokenize(joined);
}

/**
 * 1カテゴリに対するスコアリング
 * - aliases に部分一致したら +3
 * - allowedWords に部分一致したら +1
 */
function scoreCategory(
  def: CategorySafetyDefinition,
  tokens: string[]
): number {
  if (tokens.length === 0) return 0;

  let score = 0;

  for (const token of tokens) {
    if (!token) continue;

    // aliases: 強いシグナル
    for (const alias of def.aliases) {
      const a = normalizeText(alias);
      if (!a) continue;
      if (a.length >= 2 && token.includes(a)) {
        score += 3;
        break;
      }
    }

    // allowedWords: 弱めのシグナル
    for (const w of def.allowedWords) {
      const aw = normalizeText(w);
      if (!aw) continue;
      if (aw.length >= 4 && token.includes(aw)) {
        score += 1;
        break;
      }
    }
  }

  return score;
}

/**
 * 入力から CategoryKey を推定する
 *
 * - category / productName / keywords をゆるく統合してトークン化
 * - 各 CATEGORY_SAFETY に対してスコアリング
 * - 最もスコアが高いものを選ぶ（0 以下なら null）
 *
 * 注意:
 * - 「カテゴリを決めつけない」ことを優先し、スコアが 0 の場合は null を返す
 * - 後続フェーズでしきい値やロジックを調整できるようにしておく
 */
export function resolveCategoryForInput(
  input: CategoryMatchInput
): CategoryMatchResult {
  const tokens: string[] = [];

  tokens.push(...tokenize(input.category));
  tokens.push(...tokenize(input.productName));
  tokens.push(...tokenizeKeywords(input.keywords ?? null));

  if (tokens.length === 0) {
    return null;
  }

  const detail: { key: CategoryKey; label: string; score: number }[] = [];

  let bestKey: CategoryKey | null = null;
  let bestScore = 0;

  (Object.keys(CATEGORY_SAFETY) as CategoryKey[]).forEach((key) => {
    const def = CATEGORY_SAFETY[key];
    const s = scoreCategory(def, tokens);
    detail.push({ key, label: def.label, score: s });

    if (s > bestScore) {
      bestScore = s;
      bestKey = key;
    }
  });

  if (!bestKey || bestScore <= 0) {
    return null;
  }

  const bestDef = CATEGORY_SAFETY[bestKey] as CategorySafetyDefinition;


  return {
    key: bestKey,
    label: bestDef.label,
    definition: bestDef,
    score: bestScore,
    scoreDetail: detail.sort((a, b) => b.score - a.score),
  };
}
