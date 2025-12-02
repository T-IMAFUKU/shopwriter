// src/server/products/dto.ts
/**
 * Precision Plan: ProductContext → PrecisionProductPayload アダプタ
 *
 * 役割:
 * - DB レイヤー (ProductRepository) が返す ProductContext を
 *   Precision Engine / LLM に渡すための PrecisionProductPayload に変換する。
 *
 * 方針:
 * - 型定義は app/api/writer/product-dto.ts の公式 DTO に完全準拠する
 * - ProductContext から id / name に加え、
 *   specs / attributes / notices / locale など「LLM に渡してよい情報だけ」を抽出する
 * - 仕様が未定な部分は warnings で補足し、status/source で状態を明示する
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
 * - context.attributes を主なソースとする（ProductContext ログの attributeCount に対応）
 */
function mapAttributesFromContext(
  context: ProductContext | null | undefined,
): PrecisionProductDto["attributes"] {
  const attrsRaw = (context as any)?.attributes;
  if (!Array.isArray(attrsRaw)) return [];

  return (attrsRaw as Array<any>)
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;

      const name = asNonEmptyString((raw as any).name);
      if (!name) return null;

      const kindRaw = asNonEmptyString((raw as any).kind);
      const note = asNonEmptyString((raw as any).note);

      const dto: PrecisionProductAttributeDto = { name };

      if (
        kindRaw === "feature" ||
        kindRaw === "benefit" ||
        kindRaw === "warning" ||
        kindRaw === "target" ||
        kindRaw === "other"
      ) {
        dto.kind = kindRaw;
      }

      if (note) {
        dto.note = note;
      }

      return dto;
    })
    .filter((a): a is PrecisionProductAttributeDto => !!a);
}

/**
 * notices は context.notices または product.notices から取得する。
 * - 文字列配列のみを採用し、空要素は捨てる。
 */
function mapNoticesFromContext(
  context: ProductContext | null | undefined,
  productRecord: ProductContext["product"],
): string[] | undefined {
  const ctxRaw = (context as any)?.notices;
  const productRaw = (productRecord as any)?.notices;

  const src = Array.isArray(ctxRaw)
    ? ctxRaw
    : Array.isArray(productRaw)
      ? productRaw
      : [];

  const notices = src
    .map((n) => asNonEmptyString(n))
    .filter((n): n is string => !!n);

  return notices.length > 0 ? notices : undefined;
}

function mapLocaleFromContext(
  productRecord: ProductContext["product"],
): string | undefined {
  return asNonEmptyString((productRecord as any)?.locale);
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
 *    → status="found" / source="db" / product= PrecisionProductDto（id/name + specs/attributes/notices 等）
 */
export function buildPrecisionProductPayload(
  options: BuildPrecisionProductOptions,
): PrecisionProductPayload {
  const { productId, enabled = true, context, error } = options ?? {};

  // 1) 機能OFF または productId が指定されていない場合は「完全スキップ」
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

  // 2) Repository レイヤーで例外が発生した場合
  if (error) {
    return createPayload({
      status: "skipped",
      source: "db",
      product: null,
      warnings: ["product repository error (treated as skipped)"],
    });
  }

  // 3) DB から Product が取得できなかった場合
  const productRecord = context?.product ?? null;
  if (!productRecord) {
    return createPayload({
      status: "missing",
      source: "db",
      product: null,
      warnings: ["product not found in DB"],
    });
  }

  // 4) 正常に Product が取得できた場合
  const specs = mapSpecsFromContext(context ?? null);
  const attributes = mapAttributesFromContext(context ?? null);
  const notices = mapNoticesFromContext(context ?? null, productRecord);
  const locale = mapLocaleFromContext(productRecord);

  const dtoProduct: PrecisionProductDto = {
    id: (productRecord as any).id,
    name: (productRecord as any).name,
    // Phase3-P3-7 現時点では、category / brand / description 系は未使用のため undefined のまま
    category: undefined,
    brand: undefined,
    shortDescription: undefined,
    longDescription: undefined,
    specs,
    attributes,
    ...(notices ? { notices } : {}),
    ...(locale ? { locale } : {}),
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
 * - PrecisionProductPayload と同じ状態遷移ルールをざっくり踏襲し、
 *   「事実情報を安全に LLM に渡せる状態」のときだけ DTO を返す。
 * - payload.product.name など「商品名」は PRODUCT_FACTS 側で別途扱うため、
 *   ここでは specs / attributes / notices のみを facts.items に詰める。
 */
export function buildProductFactsDto(
  options: BuildPrecisionProductOptions,
): ProductFactsDto | null {
  const { productId, enabled = true, context, error } = options ?? {};

  // 機能OFF / productId 不在 / error / product 不在 の場合は facts も生成しない
  if (!enabled || !productId) return null;
  if (error) return null;

  const productRecord = context?.product ?? null;
  if (!productRecord) return null;

  const specs = mapSpecsFromContext(context ?? null);
  const attributes = mapAttributesFromContext(context ?? null);
  const notices = mapNoticesFromContext(context ?? null, productRecord);

  const items: ProductFactsItemDto[] = [];

  // 1) specs → kind="spec"
  for (const spec of specs) {
    const label = spec.key;
    const value = spec.value;
    if (!label || !value) continue;

    const item: ProductFactsItemDto = {
      kind: "spec",
      label,
      value,
      sourceId: spec.key,
      ...(spec.unit ? { unit: spec.unit } : {}),
    };

    items.push(item);
  }

  // 2) attributes → kind="attribute"
  for (const attr of attributes) {
    const label = attr.name;
    if (!label) continue;

    const value = attr.note ?? attr.name;

    const item: ProductFactsItemDto = {
      kind: "attribute",
      label,
      value,
      sourceId: attr.name,
      ...(attr.note ? { note: attr.note } : {}),
    };

    items.push(item);
  }

  // 3) notices → kind="notice"
  if (Array.isArray(notices)) {
    for (const notice of notices) {
      if (!notice) continue;

      const item: ProductFactsItemDto = {
        kind: "notice",
        label: "注意書き",
        value: notice,
      };

      items.push(item);
    }
  }

  if (!items.length) return null;

  return { items };
}
