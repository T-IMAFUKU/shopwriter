// tests/server/product-context.test.ts
// Phase3-P3-3: ProductContext → Precision DTO 変換の単体テスト
//
// 目的:
// - sanitizePrecisionProduct / buildPrecisionProductPayloadFromContext の挙動を固定する
// - found / missing / skipped 各パターンと、不正値フォールバックをテストで保証する

import { describe, it, expect } from "vitest";
import {
  buildPrecisionProductPayloadFromContext,
  sanitizePrecisionProduct,
  type ProductContextLike,
} from "../../app/api/writer/product-context";

describe("writer productContext → Precision DTO", () => {
  it("found + valid product の場合、payload.status=found で product を含む", () => {
    const ctx: ProductContextLike = {
      status: "found",
      source: "db",
      product: {
        id: "p-001",
        name: "乾燥肌向け高保湿化粧水",
        category: "化粧水",
        brand: "ShopWriter コスメ",
        shortDescription: "乾燥肌のための高保湿タイプ",
        longDescription: "角質層までうるおいを届ける保湿成分をたっぷり配合した化粧水です。",
        specs: [
          { group: "内容量・サイズ", key: "内容量", value: "200", unit: "mL" },
          { key: "香り", value: "無香料" },
        ],
        attributes: [
          { name: "敏感肌対応", kind: "feature", note: "アルコールフリーで刺激を抑えた処方です。" },
          { name: "30代女性向け", kind: "target" },
        ],
        notices: ["本商品は医薬品ではありません。効果には個人差があります。"],
        locale: "ja-JP",
      },
      warnings: ["external: loaded from ProductRepository"],
    };

    const payload = buildPrecisionProductPayloadFromContext(ctx);

    expect(payload.status).toBe("found");
    expect(payload.source).toBe("db");

    expect(payload.product).not.toBeNull();
    expect(payload.product?.id).toBe("p-001");
    expect(payload.product?.name).toBe("乾燥肌向け高保湿化粧水");
    expect(payload.product?.category).toBe("化粧水");
    expect(payload.product?.brand).toBe("ShopWriter コスメ");

    expect(payload.product?.specs).toHaveLength(2);
    expect(payload.product?.attributes).toHaveLength(2);

    // 外部 warnings が維持されていること
    expect(payload.warnings).toContain("external: loaded from ProductRepository");
  });

  it("status=found だが product が不正な場合、status は missing に格下げされ product=null になる", () => {
    const ctx: ProductContextLike = {
      status: "found",
      source: "db",
      // id / name が空 → sanitizePrecisionProduct によって null 扱い
      product: {
        id: "",
        name: "",
      },
      warnings: ["external: product row was found but incomplete"],
    };

    const payload = buildPrecisionProductPayloadFromContext(ctx);

    expect(payload.status).toBe("missing");
    expect(payload.source).toBe("db");

    expect(payload.product).toBeNull();

    // 外部 warning + 内部 warning が混在していること
    expect(payload.warnings.some((w) => w.includes("product row was found"))).toBe(true);
    expect(
      payload.warnings.some((w) =>
        w.includes("productContext.product looked like a product but failed sanitization"),
      ),
    ).toBe(true);
  });

  it("status / source が不正な文字列の場合、skipped / unknown にフォールバックし warnings に痕跡が残る", () => {
    const ctx: ProductContextLike = {
      status: "UNKNOWN_STATUS",
      source: "STRANGE_SOURCE",
      product: {
        id: "p-002",
        name: "テスト商品",
        specs: [],
        attributes: [],
      },
    };

    const payload = buildPrecisionProductPayloadFromContext(ctx);

    // 不正 status → skipped フォールバック
    expect(payload.status).toBe("skipped");
    // 不正 source → unknown フォールバック
    expect(payload.source).toBe("unknown");

    // status / source の不正値が warnings に残っていること
    expect(
      payload.warnings.some((w) => w.includes("productContext.status was invalid")),
    ).toBe(true);
    expect(
      payload.warnings.some((w) => w.includes("productContext.source was invalid")),
    ).toBe(true);
  });

  it("context が null の場合、skipped / unknown / product=null で warning が追加される", () => {
    const payload = buildPrecisionProductPayloadFromContext(null);

    expect(payload.status).toBe("skipped");
    expect(payload.source).toBe("unknown");
    expect(payload.product).toBeNull();

    expect(
      payload.warnings.some((w) => w.includes("productContext is null or undefined")),
    ).toBe(true);
  });

  it("sanitizePrecisionProduct は id / name が欠けている場合に null を返す", () => {
    const noId = sanitizePrecisionProduct({
      name: "名前だけの商品",
      specs: [],
      attributes: [],
    });

    const noName = sanitizePrecisionProduct({
      id: "only-id",
      specs: [],
      attributes: [],
    });

    expect(noId).toBeNull();
    expect(noName).toBeNull();
  });

  it("sanitizePrecisionProduct は specs / attributes / notices を安全にフィルタする", () => {
    const product = sanitizePrecisionProduct({
      id: "p-003",
      name: "フィルタリングテスト商品",
      specs: [
        { key: "内容量", value: "200", unit: "mL" },
        { key: "空文字フィルタ対象", value: "" },
        "invalid-spec",
      ],
      attributes: [
        { name: "敏感肌対応", kind: "feature", note: "アルコールフリー" },
        { name: "", kind: "feature" },
        "invalid-attr",
      ],
      notices: [
        "有効な注意書き",
        "",
        "   ",
        123,
      ],
      locale: "ja-JP",
    });

    expect(product).not.toBeNull();
    if (!product) return;

    // specs: 有効な 1 件のみ
    expect(product.specs).toHaveLength(1);
    expect(product.specs[0]).toMatchObject({
      key: "内容量",
      value: "200",
      unit: "mL",
    });

    // attributes: 有効な 1 件のみ
    expect(product.attributes).toHaveLength(1);
    expect(product.attributes[0]).toMatchObject({
      name: "敏感肌対応",
      kind: "feature",
      note: "アルコールフリー",
    });

    // notices: 空文字や空白、非文字列は除外
    expect(product.notices).toEqual(["有効な注意書き"]);
    expect(product.locale).toBe("ja-JP");
  });
});
