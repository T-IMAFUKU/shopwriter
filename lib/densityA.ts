// lib/densityA.ts
// 密度A（情報使用率型）の InputSet / UsedSet 判定ロジック（副作用なし）
// ※設計固定：意味判定なし・同義語辞書なし・分解なし
//
// densityA v0（案1：要素ベース）
// - InputSet（母集合 / inputCount） = 3 + N
//   - 3: product_name / goal / audience
//   - N: selling_points（1行=1フレーズ）
// - UsedSet（抽出 / usedCount） = 入力フレーズが出力本文に「証拠ベースで一致」した集合
// - マスキング（ログ用） = B（数字→X / 英字→* / 最大長）
// - 目的：観測（log-only）を安定化し、0に戻らない再現を作る
//
// 追加（v0の範囲内での防波堤）
// - 判定不能な “文字化け/崩れ行” は、密度Aの母集合に入れると観測が壊れるため除外する
// - これは意味判定ではなく、文字種の健全性チェック（ヒューリスティック）
//
// ✅ v0補強（A案：生成側に寄せない最小許容）
// - audience だけは自然な言い換えが起きやすく、完全一致ベースだと観測が壊れやすい
// - 辞書メンテを避けるため、固定・最小の「在宅系トークン」だけを許容する（audienceのみ）
// - これは意味判定ではなく、観測の取りこぼし防止（rescueの無駄発動抑制）が目的

export type DensityAInput = {
  // v0: 必須3
  product_name: string; // 1
  goal: string; // 1
  audience: string; // 1

  // v0: +N
  selling_points?: string[]; // 1行=1フレーズ

  // 将来拡張用（v0では inputSet に入れない）
  evidence?: string[];
  problems?: string[];
  specs?: string[];
};

export type DensityAConfig = {
  // 抽象語のみ行の除外判定に使う（未指定なら除外しない）
  abstractWords?: string[];

  // UsedSet判定：連続一致の最小長（設計固定=4）
  minConsecutiveMatch?: number; // default 4

  // unusedTop3のログ用マスク設定（設計固定：最大長＆マスク）
  logMaskMaxLen?: number; // default 20

  // v0: mother setを「3+N」に固定（明示）
  // ※将来ブロック制の拡張で増やすときは、ここを足す（設計変更点が明確になる）
  includeFutureFieldsInInputSet?: boolean; // default false（v0では使わない）
};

export type DensityAResult = {
  inputSet: string[];
  usedSet: string[];
  unusedSet: string[];
  densityA: number; // |UsedSet| / |InputSet|
  unusedTop3ForUi: string[]; // 最大3件（UI表示用：責め文言はUI側）
  unusedTop3ForLogMasked: string[]; // 最大3件（ログ用：最大長＆マスク）
};

const DEFAULT_MIN_CONSEC = 4;
const DEFAULT_LOG_MASK_MAX = 20;

/**
 * InputSet（母集合）を構築（densityA v0）
 * - 1行=1フレーズ=1カウント
 * - v0対象：product_name(1), goal(1), audience(1), selling_points(N)
 * - 抽象語のみ行は除外（abstractWords指定時のみ）
 * - 文字化け/崩れ行は除外（常時：観測保護。意味判定ではない）
 * - 重複除外（完全一致）
 * - 分解しない
 */
export function buildInputSet(input: DensityAInput, config: DensityAConfig = {}): string[] {
  const lines: string[] = [];

  // v0: 必須3（3カウントの土台）
  lines.push(input.product_name ?? "");
  lines.push(input.goal ?? "");
  lines.push(input.audience ?? "");

  // v0: +N
  pushLines(lines, input.selling_points);

  // 将来拡張（v0は既定OFF）
  if (config.includeFutureFieldsInInputSet === true) {
    pushLines(lines, input.evidence);
    pushLines(lines, input.problems);
    pushLines(lines, input.specs);
  }

  // 正規化（トリム・空行除外）
  const normalized = lines.map(normalizeLine).filter((s) => s.length > 0);

  // 観測保護：文字化け/崩れ行を除外（意味判定ではなく、文字種の健全性チェック）
  const sane = normalized.filter((s) => !isLikelyGarbledLine(s));

  // 抽象語のみ行除外（指定された場合のみ）
  const filtered = config.abstractWords?.length
    ? sane.filter((s) => !isAbstractOnlyLine(s, config.abstractWords!))
    : sane;

  // 重複除外（完全一致）
  return uniquePreserveOrder(filtered);
}

/**
 * UsedSet 判定（設計固定）
 * 1) 完全一致（出力本文内の部分一致＝substring）
 * 2) 4文字以上の連続一致（入力が4文字以上の場合）
 * 3) 数値・単位一致
 *
 * 禁止：意味判定、同義語辞書
 */
export function computeUsedSet(
  inputSet: string[],
  outputText: string,
  config: DensityAConfig = {},
): { usedSet: string[]; unusedSet: string[] } {
  const minConsec = config.minConsecutiveMatch ?? DEFAULT_MIN_CONSEC;
  const out = outputText ?? "";

  const used: string[] = [];
  const unused: string[] = [];

  for (const phrase of inputSet) {
    const p = phrase ?? "";
    if (!p) {
      // InputSetは空を除外済みの想定だが、安全側でunusedへ
      unused.push(p);
      continue;
    }

    const isUsed =
      containsExact(out, p) ||
      containsConsecutiveMatch(out, p, minConsec) ||
      containsNumericUnitMatch(out, p);

    (isUsed ? used : unused).push(p);
  }

  return {
    usedSet: uniquePreserveOrder(used),
    unusedSet: uniquePreserveOrder(unused),
  };
}

/**
 * 密度Aを算出（小数はそのまま返す）
 */
export function computeDensityA(usedSet: string[], inputSet: string[]): number {
  const denom = inputSet.length;
  if (denom <= 0) return 0;
  return usedSet.length / denom;
}

/**
 * densityAの「audience」最小許容（固定トークン）
 * - audience phrase が unused に残った場合のみ適用
 * - 出力本文に「在宅系トークン」が含まれていれば used 扱いにする
 * - 辞書メンテを避けるため、トークンは固定・最小セット
 */
function applyAudienceMinimumAllowance(args: {
  input: DensityAInput;
  outputText: string;
  usedSet: string[];
  unusedSet: string[];
}): { usedSet: string[]; unusedSet: string[]; didAdjust: boolean } {
  const audienceRaw = normalizeLine(args.input?.audience ?? "");
  if (!audienceRaw) return { usedSet: args.usedSet, unusedSet: args.unusedSet, didAdjust: false };

  // すでに used 判定なら何もしない
  if (args.usedSet.includes(audienceRaw)) return { usedSet: args.usedSet, unusedSet: args.unusedSet, didAdjust: false };

  // unusedに無いなら何もしない（InputSetに入ってない/除外された等）
  if (!args.unusedSet.includes(audienceRaw))
    return { usedSet: args.usedSet, unusedSet: args.unusedSet, didAdjust: false };

  const out = (args.outputText ?? "").toString();

  // 固定・最小：在宅系（増やす運用にしない）
  const TOKENS = ["在宅", "自宅", "リモート", "テレワーク"];

  // audience が「在宅ワーカー/在宅勤務者」等の在宅系を含む場合のみ許容を発動
  const looksRemoteAudience = /在宅|リモート|テレワーク/.test(audienceRaw);
  if (!looksRemoteAudience) return { usedSet: args.usedSet, unusedSet: args.unusedSet, didAdjust: false };

  // 出力本文に在宅系トークンがあれば used 扱い
  const hit = TOKENS.some((t) => t && out.includes(t));
  if (!hit) return { usedSet: args.usedSet, unusedSet: args.unusedSet, didAdjust: false };

  const nextUsed = uniquePreserveOrder([...args.usedSet, audienceRaw]);
  const nextUnused = uniquePreserveOrder(args.unusedSet.filter((x) => x !== audienceRaw));
  return { usedSet: nextUsed, unusedSet: nextUnused, didAdjust: true };
}

/**
 * 密度Aの一括評価（UI/ログ用Top3も生成）
 * - UI変更なしのため、ここでは文言を足さない（データだけ返す）
 */
export function evaluateDensityA(input: DensityAInput, outputText: string, config: DensityAConfig = {}): DensityAResult {
  const inputSet = buildInputSet(input, config);

  let { usedSet, unusedSet } = computeUsedSet(inputSet, outputText, config);

  // ✅ A案：audienceのみ最小許容（観測の取りこぼし防止）
  const adjusted = applyAudienceMinimumAllowance({ input, outputText, usedSet, unusedSet });
  if (adjusted.didAdjust) {
    usedSet = adjusted.usedSet;
    unusedSet = adjusted.unusedSet;
  }

  const densityA = computeDensityA(usedSet, inputSet);

  const top3 = unusedSet.slice(0, 3);
  const maxLen = config.logMaskMaxLen ?? DEFAULT_LOG_MASK_MAX;

  return {
    inputSet,
    usedSet,
    unusedSet,
    densityA,
    unusedTop3ForUi: top3,
    unusedTop3ForLogMasked: top3.map((s) => maskForLog(s, maxLen)),
  };
}

/**
 * ログ用：最大長＆マスク（設計固定：B）
 * - 本文保存禁止のため、未使用フレーズの露出を抑える
 * - 数字→X、英字→*、最大長で切る
 */
export function maskForLog(raw: string, maxLen = DEFAULT_LOG_MASK_MAX): string {
  const s = (raw ?? "").trim().slice(0, maxLen);
  return s.replace(/[0-9]/g, "X").replace(/[A-Za-z]/g, "*");
}

/* =========================
 * internal helpers
 * ========================= */

function pushLines(dst: string[], arr?: string[]) {
  if (!arr?.length) return;
  for (const v of arr) dst.push(v ?? "");
}

function normalizeLine(s: string): string {
  // 分解しないので最低限：trim + 連続空白を1つに
  return (s ?? "").trim().replace(/\s+/g, " ");
}

function uniquePreserveOrder(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of arr) {
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function containsExact(output: string, phrase: string): boolean {
  return output.includes(phrase);
}

/**
 * 「4文字以上の連続一致」
 * - phrase.length >= minLen のときのみ評価
 * - phrase 内の任意の連続minLen文字が output に含まれれば used
 */
function containsConsecutiveMatch(output: string, phrase: string, minLen: number): boolean {
  if (!phrase) return false;
  if (phrase.length < minLen) return false;

  for (let i = 0; i <= phrase.length - minLen; i++) {
    const w = phrase.slice(i, i + minLen);
    if (w && output.includes(w)) return true;
  }
  return false;
}

/**
 * 数値・単位一致
 * - phrase内から「数値+単位」候補を抽出し、同一の並びが output に含まれれば used
 * - 単位がない数値だけは誤検知しやすいので、基本は「数値+単位」を優先
 * - ただし phrase に単位付きが無い場合は「数値のみ一致」も許可
 */
function containsNumericUnitMatch(output: string, phrase: string): boolean {
  const out = output ?? "";
  const p = phrase ?? "";
  if (!p) return false;

  const pairs = extractNumericUnitPairs(p);
  if (pairs.withUnit.length > 0) {
    return pairs.withUnit.some((token) => out.includes(token));
  }
  if (pairs.numberOnly.length > 0) {
    return pairs.numberOnly.some((token) => out.includes(token));
  }
  return false;
}

function extractNumericUnitPairs(text: string): { withUnit: string[]; numberOnly: string[] } {
  const num = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?`;
  const unit = String.raw`(?:%|℃|°C|円|個|本|枚|回|分|秒|時間|日|年|mL|ml|L|l|g|kg|mg|cm|mm|m|km)`;

  const reWithUnit = new RegExp(`${num}\\s*${unit}`, "g");
  const reNumberOnly = new RegExp(`${num}`, "g");

  const withUnit = Array.from(text.matchAll(reWithUnit)).map((m) => m[0].replace(/\s+/g, ""));
  const numberOnly = Array.from(text.matchAll(reNumberOnly)).map((m) => m[0]);

  return {
    withUnit: uniquePreserveOrder(withUnit),
    numberOnly: uniquePreserveOrder(numberOnly),
  };
}

/**
 * 抽象語のみ行（abstractWordsの全一致トークンのみで構成される行）
 * - 設計の「抽象語のみの行は除外」を、辞書が与えられた時だけ厳密に適用
 * - 分解禁止なので、ここでは “トークン分割” を最小限（空白/記号）に限定
 */
function isAbstractOnlyLine(line: string, abstractWords: string[]): boolean {
  const set = new Set(abstractWords.map((s) => normalizeToken(s)).filter(Boolean));
  if (set.size === 0) return false;

  const tokens = tokenizeMinimal(line).map(normalizeToken).filter(Boolean);
  if (tokens.length === 0) return false;

  return tokens.every((t) => set.has(t));
}

function tokenizeMinimal(s: string): string[] {
  return (s ?? "").split(/[\s、。・/|｜,，]+/g);
}

function normalizeToken(s: string): string {
  return (s ?? "").trim();
}

/**
 * 文字化け/崩れ行の推定（意味判定ではない）
 * - 「�」（replacement char）が含まれる → ほぼ確定で崩れ
 * - “許容文字” 以外の比率が高い → 判定不能として除外
 * - 極端に記号が多い → 除外
 *
 * 許容文字：
 * - ASCII可視（半角英数記号）
 * - 日本語（ひらがな/カタカナ/漢字）
 * - 全角の基本記号（句読点/長音/中点など）
 * - 全角英数
 */
function isLikelyGarbledLine(line: string): boolean {
  const s = (line ?? "").trim();
  if (!s) return false;

  // replacement char
  if (s.includes("\uFFFD")) return true;

  let allowed = 0;
  let symbols = 0;

  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;

    // ASCII printable
    if (cp >= 0x20 && cp <= 0x7e) {
      allowed++;
      if (isAsciiSymbol(cp)) symbols++;
      continue;
    }

    // Hiragana / Katakana / CJK Unified Ideographs
    if (
      (cp >= 0x3040 && cp <= 0x309f) || // Hiragana
      (cp >= 0x30a0 && cp <= 0x30ff) || // Katakana
      (cp >= 0x4e00 && cp <= 0x9fff) // Kanji
    ) {
      allowed++;
      continue;
    }

    // Fullwidth forms (全角英数記号の一部)
    if (cp >= 0xff01 && cp <= 0xff60) {
      allowed++;
      // 全角記号は symbol 扱い
      if (cp >= 0xff01 && cp <= 0xff0f) symbols++;
      if (cp >= 0xff1a && cp <= 0xff20) symbols++;
      if (cp >= 0xff3b && cp <= 0xff40) symbols++;
      if (cp >= 0xff5b && cp <= 0xff60) symbols++;
      continue;
    }

    // Common Japanese punctuation
    if (isCommonJaPunct(cp)) {
      allowed++;
      symbols++;
      continue;
    }

    // その他は “不許容”
  }

  const total = Array.from(s).length;
  if (total <= 0) return false;

  const allowedRatio = allowed / total;
  const symbolRatio = symbols / total;

  // 60%未満しか “許容文字” がない → 判定不能の可能性が高い
  if (allowedRatio < 0.6) return true;

  // 記号が過剰（ログ崩れや混線の疑い）
  if (symbolRatio > 0.55 && total >= 6) return true;

  return false;
}

function isAsciiSymbol(cp: number): boolean {
  // ASCII printableのうち英数字以外をざっくり symbol 扱い
  // 0-9 A-Z a-z は除外
  if (cp >= 0x30 && cp <= 0x39) return false;
  if (cp >= 0x41 && cp <= 0x5a) return false;
  if (cp >= 0x61 && cp <= 0x7a) return false;
  return true;
}

function isCommonJaPunct(cp: number): boolean {
  // 、。・ー「」『』（）【】〜…！？
  return (
    cp === 0x3001 || // 、
    cp === 0x3002 || // 。
    cp === 0x30fb || // ・
    cp === 0x30fc || // ー
    cp === 0x300c || // 「
    cp === 0x300d || // 」
    cp === 0x300e || // 『
    cp === 0x300f || // 』
    cp === 0x3010 || // 【
    cp === 0x3011 || // 】
    cp === 0x301c || // 〜
    cp === 0x2026 || // …
    cp === 0x2014 || // —
    cp === 0xff01 || // ！
    cp === 0xff1f || // ？
    cp === 0xff08 || // （
    cp === 0xff09 // ）
  );
}
