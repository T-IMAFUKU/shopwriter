/** app/api/writer/prompt/product-facts.ts
 * Phase3-P3-5/P3-6/P3-7: PRODUCT_FACTS ブロック
 *
 * 目的:
 * - PrecisionProductPayload から「LLM に渡してよい事実情報だけ」を取り出し、
 *   PRODUCT_FACTS ブロックとして扱う公式レイヤーを用意する
 * - MVP では「商品名のみ」を扱うシンプルな構造から始め、
 *   P3-7 で specs / attributes / notices 由来の facts を items に正式に注入する
 *
 * 注意:
 * - 既存の pipeline.ts との互換性を保つため、
 *   外向きの buildProductFactsBlock は string | null を返すラッパーとし、
 *   型付きの ProductFactsBlock は内部モデルとして扱う。
 */

import type {
  PrecisionProductPayload,
  ProductFactsDto,
} from "../product-dto";

/** PRODUCT_FACTS の 1 行分（ラベル付きの事実） */
export interface ProductFactsItem {
  /** 機械用キー（例: "product_name" / "capacity_ml"） */
  key: string;
  /** LLM に見せるラベル（例: "商品名" / "内容量"） */
  label: string;
  /** 実際に渡す値（例: "ナイトリッチモイストローション" / "150mL"） */
  value: string;
}

/** PRODUCT_FACTS ブロック全体の構造（後続拡張前提の MVP） */
export interface ProductFactsBlock {
  kind: "PRODUCT_FACTS";
  title: string;
  items: ProductFactsItem[];
}

/**
 * 外向きAPI:
 * PrecisionProductPayload から PRODUCT_FACTS ブロック文字列を構築する。
 *
 * - 既存の pipeline.ts では「string | null」を期待しているため、
 *   その契約を維持したまま内部で型付きブロックを組み立ててから
 *   Markdown 文字列へレンダリングする。
 */
export function buildProductFactsBlock(
  payload: PrecisionProductPayload | null | undefined,
  facts?: ProductFactsDto | null,
): string | null {
  const block = buildProductFactsModel(payload, facts);
  return renderProductFactsBlock(block);
}

/**
 * 内部モデル構築:
 * PrecisionProductPayload と ProductFactsDto から ProductFactsBlock を組み立てる。
 *
 * - payload.product.name を 1 行として優先的に追加する
 * - facts.items から specs / attributes / notices 由来の行をマージする
 * - 利用できる事実行が 1 行もない場合は null を返す
 */
export function buildProductFactsModel(
  payload: PrecisionProductPayload | null | undefined,
  facts?: ProductFactsDto | null,
): ProductFactsBlock | null {
  const items = buildProductFactsItems(payload, facts);
  if (!items.length) return null;

  return {
    kind: "PRODUCT_FACTS",
    title: "PRODUCT_FACTS（DB由来の事実情報）",
    items,
  };
}

/**
 * PrecisionProductPayload / ProductFactsDto から
 * PRODUCT_FACTS の items 配列を構築する内部ヘルパー。
 *
 * - 1) payload.product.name から商品名の行を追加
 * - 2) facts.items から specs / attributes / notices 由来の facts を追加
 *      - DTO 側には key を持たせず、ここでラベルからフォールバックキーを生成する
 *      - ラベル・値のどちらかが空の行はスキップ
 *      - value と unit を連結して 1 つの値とみなし、同じ value は 1 回だけにする
 */
function buildProductFactsItems(
  payload: PrecisionProductPayload | null | undefined,
  facts?: ProductFactsDto | null,
): ProductFactsItem[] {
  const items: ProductFactsItem[] = [];

  // 1) payload.product.name から商品名の行だけを追加
  if (payload && payload.product) {
    const name = normalizeText(
      (payload.product as { name?: unknown }).name,
    );
    if (name) {
      items.push({
        key: "product_name",
        label: "商品名",
        value: name,
      });
    }
  }

  // 2) facts.items から specs / attributes / notices 由来の facts を追加
  if (facts && Array.isArray(facts.items)) {
    for (const raw of facts.items) {
      // DTO の shape に強く依存しないよう、必要なフィールドだけを安全に取り出す
      const label = normalizeLabel(
        (raw as { label?: unknown }).label,
      );

      // value と unit を連結（例: value=500, unit="mL" → "500mL"）
      const value = buildValueWithUnit(
        (raw as { value?: unknown }).value,
        (raw as { unit?: unknown }).unit,
      );

      // ラベル or 値が空の行はスキップ（LLM に見せる意味がないため）
      if (!label || !value) {
        continue;
      }

      // 既存 items との重複チェック（同じ value は 1 回だけ）
      if (isDuplicateFact(items, value)) {
        continue;
      }

      // ラベルからフォールバックキーを生成
      const safeKey = buildFallbackKeyFromLabel(label);

      items.push({
        key: safeKey,
        label,
        value,
      });
    }
  }

  return items;
}

/**
 * 内部の値を「安全に文字列化」するためのミニヘルパー。
 * - string は前後の空白だけを削って、そのまま利用
 * - number は有限値のみ string 化して利用（NaN / Infinity 系は破棄）
 * - それ以外は空文字列として扱う
 */
function normalizeText(value: unknown): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    return String(value);
  }
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed;
}

/**
 * value と unit を連結した値を作る。
 * - value が空なら常に空文字列
 * - unit があれば value の後ろにそのまま連結する（例: "500" + "mL" → "500mL"）
 */
function buildValueWithUnit(
  rawValue: unknown,
  rawUnit: unknown,
): string {
  const value = normalizeText(rawValue);
  if (!value) return "";
  const unit = normalizeText(rawUnit);
  if (!unit) return value;
  return `${value}${unit}`;
}

/**
 * LLM に見せるラベルを正規化する。
 * - string 以外は空文字列として扱う
 * - 前後の空白だけを削り、表記そのものは保持する
 */
function normalizeLabel(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed;
}

/**
 * ラベルからフォールバックキーを生成する。
 * - 日本語ラベルでも安定した key になるよう、空白を "_" に置き換えつつ
 *   記号は削除しておく（例: "内容量 (ml)" → "内容量_ml"）
 */
function buildFallbackKeyFromLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return "fact";
  return trimmed
    .replace(/\s+/g, "_")
    .replace(/[^\p{Letter}\p{Number}_]/gu, "");
}

/**
 * すでに同等の事実行が存在するかどうかを判定する。
 *
 * - 「同じ value を持つ行」は 1 行だけにする
 * - key / label の違いに関わらず、value が同じなら重複としてスキップ
 */
function isDuplicateFact(
  existing: ProductFactsItem[],
  value: string,
): boolean {
  const normalizedValue = value.trim();
  if (!normalizedValue) return false;
  return existing.some(
    (item) => item.value.trim() === normalizedValue,
  );
}

/**
 * PRODUCT_FACTS ブロックを、system prompt に埋め込める
 * Markdown 文字列としてレンダリングする。
 *
 * - 後続で specs / attributes / notices が増えても、この関数は極力そのまま維持できる構造にしておく
 */
export function renderProductFactsBlock(
  block: ProductFactsBlock | null | undefined,
): string | null {
  if (!block || !block.items.length) return null;

  const lines: string[] = [];

  // セクション見出し
  lines.push("## PRODUCT_FACTS");
  lines.push("");

  // Precision Mode 用のガイド文（「ここだけが事実」だと明示）
  lines.push(
    "_以下は DB などの信頼できるソースから取得した事実情報です。推測や補完をせず、この範囲に含まれる内容だけを事実として扱ってください。_",
  );
  lines.push("");

  // 個々の事実行（MVP: 商品名＋ P3-7 で追加される各種スペック）
  for (const item of block.items) {
    const value = item.value.trim();
    if (!value) continue;
    lines.push(`- ${item.label}: ${value}`);
  }

  // items がすべて空文字列だった場合は null 扱いにする
  const hasFactLine = lines.length > 4; // 見出し＋ガイド文だけで 4 行
  if (!hasFactLine) {
    return null;
  }

  return lines.join("\n");
}
