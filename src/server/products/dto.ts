// src/server/products/dto.ts
/**
 * Precision Plan: ProductContext → PrecisionProductPayload アダプタ
 *
 * 役割:
 * - DB レイヤー (ProductRepository) が返す ProductContext を
 *   Precision Engine / LLM に渡すための PrecisionProductPayload に変換する。
 *
 * 方針:
 * - 型定義は app/api/writer/product-dto.ts の公式 DTO に準拠する
 * - ProductContext から id / name / specs / attributes / factsNote など
 *   「LLM に渡してよい情報だけ」を抽出する
 * - 生成本線へ渡す block は scene / value / evidence / guard に責務分解する
 * - schema に存在しない notices / locale 前提はここでは持ち込まない
 */

import type { ProductContext } from "./repository";
import type {
  PrecisionProductPayload,
  PrecisionProductStatus,
  PrecisionProductDataSource,
  PrecisionProductDto,
  PrecisionProductAttributeDto,
  ProductFactsDto,
  ProductFactsItemDto,
} from "../../../app/api/writer/product-dto";

/**
 * アダプタの入力オプション
 *
 * - productId: リクエストで指定された productId（無いなら undefined/null）
 * - enabled: Precision Product 機能が有効かどうか（feature flag 用）
 * - context: Repository から取得した ProductContext
 * - error: Repository まわりで発生した例外（あれば）
 */
export type BuildPrecisionProductOptions = {
  productId?: string | null;
  enabled?: boolean;
  context?: ProductContext | null;
  error?: unknown;
};

export type ProductFactsBlockStatus = "found" | "missing" | "skipped";
export type ProductFactsBlockSource = "db" | "unknown";

export type ProductFactsBlockEvidenceItem = {
  label: string;
  value: string;
  unit?: string;
};

export type ProductFactsBlock = {
  scene: string[];
  value: string[];
  evidence: ProductFactsBlockEvidenceItem[];
  guard: string[];
  meta: {
    status: ProductFactsBlockStatus;
    source: ProductFactsBlockSource;
  };
};

/**
 * internal helper: PrecisionProductPayload を組み立てる
 */
function createPayload(params: {
  status: PrecisionProductStatus;
  source: PrecisionProductDataSource;
  product: PrecisionProductDto | null;
  warnings?: string[];
}): PrecisionProductPayload {
  const { status, source, product, warnings } = params;

  return {
    status,
    source,
    product,
    warnings: warnings ?? [],
  };
}

/** ====== 内部ヘルパー: サニタイズ系 ====== */

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function uniqueNonEmptyStrings(list: Array<unknown>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const item of list) {
    const value = asNonEmptyString(item);
    if (!value) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }

  return out;
}

/**
 * ProductContext から specs 配列を DTO 用にマッピングする。
 * - context.specs を主なソースとする（ProductContext ログの specCount に対応）
 */
function mapSpecsFromContext(
  context: ProductContext | null | undefined,
): PrecisionProductDto["specs"] {
  const specsRaw = (context as any)?.specs;
  if (!Array.isArray(specsRaw)) return [];

  return (specsRaw as Array<any>)
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;

      const key = asNonEmptyString((raw as any).key);
      const value = asNonEmptyString((raw as any).value);
      if (!key || !value) return null;

      const group = asNonEmptyString((raw as any).group);
      const unit = asNonEmptyString((raw as any).unit);

      return {
        key,
        value,
        ...(group ? { group } : {}),
        ...(unit ? { unit } : {}),
      };
    })
    .filter((s): s is PrecisionProductDto["specs"][number] => !!s);
}

/**
 * ProductContext から attributes 配列を DTO 用にマッピングする。
 * - schema 実態に合わせて key / value を読む
 * - Precision DTO 側では name / note に寄せる
 */
function mapAttributesFromContext(
  context: ProductContext | null | undefined,
): PrecisionProductDto["attributes"] {
  const attrsRaw = (context as any)?.attributes;
  if (!Array.isArray(attrsRaw)) return [];

  return (attrsRaw as Array<any>)
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;

      const key = asNonEmptyString((raw as any).key);
      const value = asNonEmptyString((raw as any).value);
      if (!key || !value) return null;

      const dto: PrecisionProductAttributeDto = {
        name: key,
        note: value,
      };

      return dto;
    })
    .filter((a): a is PrecisionProductAttributeDto => !!a);
}

function collectPurposeValues(
  context: ProductContext | null | undefined,
): string[] {
  const attrsRaw = (context as any)?.attributes;
  if (!Array.isArray(attrsRaw)) return [];

  return uniqueNonEmptyStrings(
    (attrsRaw as Array<any>)
      .filter((raw) => raw && typeof raw === "object" && asNonEmptyString((raw as any).key) === "purpose")
      .map((raw) => (raw as any).value),
  );
}

function collectValueValues(
  context: ProductContext | null | undefined,
): string[] {
  const attrsRaw = (context as any)?.attributes;
  if (!Array.isArray(attrsRaw)) return [];

  return uniqueNonEmptyStrings(
    (attrsRaw as Array<any>)
      .filter((raw) => raw && typeof raw === "object" && asNonEmptyString((raw as any).key) === "value")
      .map((raw) => (raw as any).value),
  );
}

function collectFactsNoteValues(
  productRecord: ProductContext["product"] | null | undefined,
): string[] {
  const factNote = asNonEmptyString((productRecord as any)?.factsNote);
  return factNote ? [factNote] : [];
}

function buildEvidenceFromContext(
  context: ProductContext | null | undefined,
): ProductFactsBlockEvidenceItem[] {
  const specs = mapSpecsFromContext(context);
  const attributesRaw = Array.isArray((context as any)?.attributes)
    ? ((context as any)?.attributes as Array<any>)
    : [];

  const evidence: ProductFactsBlockEvidenceItem[] = [];
  const seen = new Set<string>();

  const push = (item: ProductFactsBlockEvidenceItem | null) => {
    if (!item) return;
    const key = `${item.label}:${item.value}:${item.unit ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    evidence.push(item);
  };

  for (const spec of specs) {
    push({
      label: spec.key,
      value: spec.value,
      ...(spec.unit ? { unit: spec.unit } : {}),
    });
  }

  for (const raw of attributesRaw) {
    if (!raw || typeof raw !== "object") continue;
    const key = asNonEmptyString((raw as any).key);
    const value = asNonEmptyString((raw as any).value);
    if (!key || !value) continue;
    if (key === "purpose" || key === "value") continue;

    push({
      label: key,
      value,
    });
  }

  return evidence;
}

function buildBlockMeta(
  options: BuildPrecisionProductOptions,
): ProductFactsBlock["meta"] {
  const { productId, enabled = true, context, error } = options ?? {};
  if (!enabled || !productId) {
    return { status: "skipped", source: "unknown" };
  }
  if (error) {
    return { status: "skipped", source: "db" };
  }
  if (!context?.product) {
    return { status: "missing", source: "db" };
  }
  return { status: "found", source: "db" };
}

/**
 * ProductContext / BuildPrecisionProductOptions から
 * renderer 用の責務分解 block を組み立てる。
 *
 * - scene: ProductAttribute(key="purpose")
 * - value: ProductAttribute(key="value")
 * - evidence: specs + purpose/value 以外の attributes
 * - guard: Product.factsNote
 */
export function buildProductFactsBlock(
  options: BuildPrecisionProductOptions,
): ProductFactsBlock {
  const { context } = options ?? {};
  const productRecord = context?.product ?? null;

  return {
    scene: collectPurposeValues(context ?? null),
    value: collectValueValues(context ?? null),
    evidence: buildEvidenceFromContext(context ?? null),
    guard: collectFactsNoteValues(productRecord),
    meta: buildBlockMeta(options),
  };
}

/**
 * ProductContext → PrecisionProductPayload 変換アダプタ
 *
 * 状態遷移ルール（現行）:
 * 1. enabled=false または productId なし
 *    → status="skipped" / source="unknown" / product=null
 * 2. error がある
 *    → status="skipped" / source="db" / product=null（warnings で理由を残す）
 * 3. context.product が無い
 *    → status="missing" / source="db" / product=null
 * 4. context.product がある
 *    → status="found" / source="db" / product= PrecisionProductDto（id/name + specs/attributes 等）
 */
export function buildPrecisionProductPayload(
  options: BuildPrecisionProductOptions,
): PrecisionProductPayload {
  const { productId, enabled = true, context, error } = options ?? {};

  if (!enabled || !productId) {
    const warnings: string[] = [];

    if (!productId) warnings.push("productId not provided");
    if (!enabled) warnings.push("product feature disabled");

    return createPayload({
      status: "skipped",
      source: "unknown",
      product: null,
      warnings,
    });
  }

  if (error) {
    return createPayload({
      status: "skipped",
      source: "db",
      product: null,
      warnings: ["product repository error (treated as skipped)"],
    });
  }

  const productRecord = context?.product ?? null;
  if (!productRecord) {
    return createPayload({
      status: "missing",
      source: "db",
      product: null,
      warnings: ["product not found in DB"],
    });
  }

  const specs = mapSpecsFromContext(context ?? null);
  const attributes = mapAttributesFromContext(context ?? null);

  const dtoProduct: PrecisionProductDto = {
    id: (productRecord as any).id,
    name: (productRecord as any).name,
    category: asNonEmptyString((productRecord as any).category),
    brand: asNonEmptyString((productRecord as any).brand),
    shortDescription: asNonEmptyString((productRecord as any).description),
    longDescription: undefined,
    specs,
    attributes,
  };

  return createPayload({
    status: "found",
    source: "db",
    product: dtoProduct,
    warnings: [],
  });
}

/** ====== PRODUCT_FACTS 用 DTO 構築ヘルパー ====== */

/**
 * ProductContext / BuildPrecisionProductOptions から
 * PRODUCT_FACTS 用の ProductFactsDto を組み立てる。
 *
 * - 生成本線 block と同じソースを使う
 * - specs / attributes / factsNote を観測用に安全な item 配列へ落とす
 */
export function buildProductFactsDto(
  options: BuildPrecisionProductOptions,
): ProductFactsDto | null {
  const { productId, enabled = true, context, error } = options ?? {};

  if (!enabled || !productId) return null;
  if (error) return null;

  const productRecord = context?.product ?? null;
  if (!productRecord) return null;

  const block = buildProductFactsBlock(options);
  const items: ProductFactsItemDto[] = [];

  for (const item of block.evidence) {
    const label = item.label;
    const value = item.value;
    if (!label || !value) continue;

    items.push({
      kind: "spec",
      label,
      value,
      sourceId: label,
      ...(item.unit ? { unit: item.unit } : {}),
    });
  }

  for (const scene of block.scene) {
    items.push({
      kind: "attribute",
      label: "purpose",
      value: scene,
      sourceId: "purpose",
    });
  }

  for (const value of block.value) {
    items.push({
      kind: "attribute",
      label: "value",
      value,
      sourceId: "value",
    });
  }

  for (const note of block.guard) {
    items.push({
      kind: "notice",
      label: "補足情報",
      value: note,
    });
  }

  if (!items.length) return null;
  return { items };
}
