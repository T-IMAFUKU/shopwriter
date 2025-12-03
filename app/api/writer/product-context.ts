/** app/api/writer/product-context.ts
 * Phase3-P3-3: ProductContext → Precision DTO（LLM ペイロード変換レイヤー）
 *
 * 目的:
 * - writer.productContext に近い構造から、LLM に渡す安全な Precision DTO へ変換する。
 * - 不正な値や欠損をサニタイズし、「推測で補わない」形のペイロードを作る。
 * - 型定義（product-dto.ts）と分離し、変換ロジックをここに集約する。
 *
 * 注意:
 * - 入力は ProductContext 専用の厳密な型ではなく、ログ構造に近い疎な型（unknown ベース）として扱う。
 * - 変換に失敗した場合は、「missing / skipped」扱いにフォールバックし、warnings に理由を残す。
 */

import type {
  PrecisionProductAttributeDto,
  PrecisionProductDataSource,
  PrecisionProductDto,
  PrecisionProductPayload,
  PrecisionProductStatus,
} from "./product-dto";

/** ====== ユーティリティ（内部専用） ====== */

function isPrecisionProductStatus(value: unknown): value is PrecisionProductStatus {
  return value === "found" || value === "missing" || value === "skipped";
}

function isPrecisionProductDataSource(value: unknown): value is PrecisionProductDataSource {
  return value === "db" || value === "api" || value === "cache" || value === "unknown";
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * LLM に渡す商品 DTO（PrecisionProductDto）として安全に扱えるかを軽くチェックする型ガード。
 * - 「厳密に型通りか」ではなく、「最低限 id と name が string であるか」を見る。
 */
function isLikelyPrecisionProductDto(value: unknown): value is PrecisionProductDto {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.id === "string" && typeof obj.name === "string";
}

/** ====== ProductContext から product DTO 部分をサニタイズ ====== */

/**
 * 任意のオブジェクトから PrecisionProductDto へのサニタイズ変換。
 * - id / name がなければ null を返し、「商品情報としては使わない」扱いにする。
 * - specs / attributes / notices は安全な要素だけを抽出して配列化する。
 */
export function sanitizePrecisionProduct(input: unknown): PrecisionProductDto | null {
  if (!input || typeof input !== "object") return null;

  const obj = input as Record<string, unknown>;

  const id = asNonEmptyString(obj.id);
  const name = asNonEmptyString(obj.name);
  if (!id || !name) {
    return null;
  }

  const category = asNonEmptyString(obj.category);
  const brand = asNonEmptyString(obj.brand);
  const shortDescription = asNonEmptyString(obj.shortDescription);
  const longDescription = asNonEmptyString(obj.longDescription);

  const specsInput = Array.isArray(obj.specs) ? obj.specs : [];
  const specs: PrecisionProductDto["specs"] = specsInput
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;
      const r = raw as Record<string, unknown>;

      const key = asNonEmptyString(r.key);
      const value = asNonEmptyString(r.value);
      if (!key || !value) return null;

      const group = asNonEmptyString(r.group);
      const unit = asNonEmptyString(r.unit);

      return {
        key,
        value,
        ...(group ? { group } : {}),
        ...(unit ? { unit } : {}),
      };
    })
    .filter(Boolean) as PrecisionProductDto["specs"];

  const attrsInput = Array.isArray(obj.attributes) ? obj.attributes : [];
  const attributes: PrecisionProductDto["attributes"] = attrsInput
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;
      const r = raw as Record<string, unknown>;

      const nameAttr = asNonEmptyString(r.name);
      if (!nameAttr) return null;

      const kindRaw = asNonEmptyString(r.kind);
      const note = asNonEmptyString(r.note);

      const dto: PrecisionProductAttributeDto = { name: nameAttr };

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
    .filter(Boolean) as PrecisionProductDto["attributes"];

  const noticesInput = Array.isArray(obj.notices) ? obj.notices : [];
  const notices = noticesInput
    .map((n) => asNonEmptyString(n))
    .filter((n): n is string => !!n);

  const locale = asNonEmptyString(obj.locale);

  return {
    id,
    name,
    category,
    brand,
    shortDescription,
    longDescription,
    specs,
    attributes,
    ...(notices.length > 0 ? { notices } : {}),
    ...(locale ? { locale } : {}),
  };
}

/** ====== ProductContext ライク構造 → PrecisionProductPayload ====== */

/**
 * writerLogger の productContext ログと同等の構造を想定した疎な入力型。
 * - 実際の ProductContext 専用型があれば、後続フェーズで差し替え可能。
 */
export interface ProductContextLike {
  status?: unknown;
  source?: unknown;
  product?: unknown;
  warnings?: unknown;
}

/**
 * ProductContext ライクな構造から PrecisionProductPayload を構築する。
 * - 不正な status / source はフォールバックしつつ warnings に痕跡を残す。
 * - status="found" でも、product がサニタイズに失敗した場合は "missing" に格下げする。
 */
export function buildPrecisionProductPayloadFromContext(
  context: ProductContextLike | null | undefined,
): PrecisionProductPayload {
  const internalWarnings: string[] = [];

  if (!context) {
    internalWarnings.push("productContext is null or undefined; treating as skipped.");
  }

  const statusRaw = context?.status;
  const status: PrecisionProductStatus = isPrecisionProductStatus(statusRaw)
    ? statusRaw
    : "skipped";

  if (!isPrecisionProductStatus(statusRaw)) {
    if (statusRaw !== undefined) {
      internalWarnings.push(`productContext.status was invalid: ${String(statusRaw)}`);
    }
  }

  const sourceRaw = context?.source;
  const source: PrecisionProductDataSource = isPrecisionProductDataSource(sourceRaw)
    ? sourceRaw
    : "unknown";

  if (!isPrecisionProductDataSource(sourceRaw)) {
    if (sourceRaw !== undefined) {
      internalWarnings.push(`productContext.source was invalid: ${String(sourceRaw)}`);
    }
  }

  let product: PrecisionProductDto | null = null;

  if (status === "found") {
    // context.product が PrecisionProductDto に近い形なら、そのまま or サニタイズして採用。
    if (isLikelyPrecisionProductDto(context?.product)) {
      product = sanitizePrecisionProduct(context?.product);
      if (!product) {
        internalWarnings.push(
          "productContext.product looked like a product but failed sanitization; treating as missing.",
        );
      }
    } else {
      internalWarnings.push(
        "productContext.product is missing or invalid for status=found; treating as missing.",
      );
    }
  }

  // context.warnings から文字列配列を正規化
  const externalWarnings: string[] = [];
  const rawWarnings = context?.warnings;

  if (Array.isArray(rawWarnings)) {
    for (const w of rawWarnings) {
      const s = asNonEmptyString(w);
      if (s) externalWarnings.push(s);
    }
  } else {
    const single = asNonEmptyString(rawWarnings);
    if (single) externalWarnings.push(single);
  }

  // status=found だが product が null の場合は missing に格下げする。
  const finalStatus: PrecisionProductStatus =
    status === "found" && !product ? "missing" : status;

  const finalProduct: PrecisionProductPayload["product"] =
    finalStatus === "found" ? product : null;

  const warnings = [...externalWarnings, ...internalWarnings];

  return {
    status: finalStatus,
    source,
    product: finalProduct,
    warnings,
  };
}
