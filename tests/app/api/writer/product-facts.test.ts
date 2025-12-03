// tests/app/api/writer/product-facts.test.ts
import { describe, it, expect } from "vitest";

import {
  buildProductFactsModel,
  renderProductFactsBlock,
  type ProductFactsBlock,
} from "@/app/api/writer/prompt/product-facts";

/**
 * テスト用ヘルパ
 * - PrecisionProductPayload / ProductFactsDto の「ざっくり似た形」を any で作る
 * - 型定義に縛られず、挙動だけを検証する
 */
function makePayload(partial: any): any {
  const base = {
    status: "ok",
    source: "test",
    product: {
      id: "p_test",
      sku: "SKU-TEST",
      name: "",
      description: "",
      category: "",
      brand: "",
      url: "",
      imageUrl: "",
      specs: [] as any[],
      attributes: [] as any[],
    },
    warnings: [] as any[],
  };

  return {
    ...base,
    ...partial,
    product: {
      ...base.product,
      ...(partial?.product ?? {}),
    },
  };
}

function makeFacts(items: any[]): any {
  return {
    status: "ok",
    source: "test",
    productId: "p_test",
    items: items.map((item, index) => ({
      key: item.key ?? `k${index}`,
      label: item.label ?? "",
      value: item.value ?? "",
      unit: item.unit ?? null,
      kind: item.kind ?? "fact",
    })),
  };
}

/** ====== buildProductFactsModel のテスト ====== */

describe("PRODUCT_FACTS: buildProductFactsModel", () => {
  it("商品名だけの payload から 1 行分の facts を構築できる", () => {
    const payload = makePayload({ product: { name: "サンプル商品" } });
    const facts: any = null;

    const block = buildProductFactsModel(payload, facts);

    expect(block).not.toBeNull();
    expect(block!.kind).toBe("PRODUCT_FACTS");
    expect(block!.items).toHaveLength(1);
    expect(block!.items[0]).toEqual({
      key: "product_name",
      label: "商品名",
      value: "サンプル商品",
    });
  });

  it("facts.items と payload.product.name がマージされる", () => {
    const payload = makePayload({ product: { name: "サンプル商品" } });
    const facts = makeFacts([
      { key: "capacity", label: "容量", value: "500", unit: "mL", kind: "spec" },
    ]);

    const block = buildProductFactsModel(payload, facts);

    expect(block).not.toBeNull();
    expect(block!.items.length).toBe(2);

    const names = block!.items.map((i) => i.label);
    const values = block!.items.map((i) => i.value);

    expect(names).toContain("商品名");
    expect(values).toContain("サンプル商品");

    expect(names).toContain("容量");
    expect(values).toContain("500mL");
  });

  it("label または value が空の facts 行はスキップされる", () => {
    const payload = makePayload({ product: { name: "" } });
    const facts = makeFacts([
      { label: "", value: "100" },
      { label: "サイズ", value: "" },
      { label: "有効", value: "OK" },
    ]);

    const block = buildProductFactsModel(payload, facts);

    expect(block).not.toBeNull();
    expect(block!.items).toHaveLength(1);
    expect(block!.items[0].label).toBe("有効");
    expect(block!.items[0].value).toBe("OK");
  });

  it("すべての情報が無い場合は null を返す", () => {
    const payload = makePayload({ product: { name: "" } });
    const facts = makeFacts([
      { label: "", value: "" },
      { label: "サイズ", value: "" },
    ]);

    const block = buildProductFactsModel(payload, facts);
    expect(block).toBeNull();
  });

  it("同じ value で key か label が被る行は重複としてスキップされる", () => {
    const payload = makePayload({ product: { name: "同じ値" } });

    const facts = makeFacts([
      { key: "a", label: "A", value: "同じ値" },
      { key: "b", label: "B", value: "同じ値" },
      { key: "c", label: "C", value: "別の値" },
    ]);

    const block = buildProductFactsModel(payload, facts);

    expect(block).not.toBeNull();
    const values = block!.items.map((i) => i.value);

    // "同じ値" が 1 回だけになることを保証
    expect(values.filter((v) => v === "同じ値").length).toBe(1);
    // "別の値" は残っている
    expect(values).toContain("別の値");
  });
});

/** ====== renderProductFactsBlock のテスト ====== */

describe("PRODUCT_FACTS: renderProductFactsBlock", () => {
  it("null または items が空の場合は null を返す", () => {
    const blockNull: ProductFactsBlock | null = null;
    const blockEmpty: ProductFactsBlock = {
      kind: "PRODUCT_FACTS",
      title: "empty",
      items: [],
    };

    expect(renderProductFactsBlock(blockNull)).toBeNull();
    expect(renderProductFactsBlock(blockEmpty)).toBeNull();
  });

  it("有効な items がある場合は Markdown を返す", () => {
    const block: ProductFactsBlock = {
      kind: "PRODUCT_FACTS",
      title: "facts",
      items: [
        { key: "a", label: "A", value: "100mL" },
        { key: "b", label: "B", value: "200g" },
      ],
    };

    const markdown = renderProductFactsBlock(block);

    expect(markdown).not.toBeNull();
    expect(markdown).toContain("## PRODUCT_FACTS");
    expect(markdown).toContain("- A: 100mL");
    expect(markdown).toContain("- B: 200g");
  });

  it("値がすべて空白の場合は null を返す", () => {
    const block: ProductFactsBlock = {
      kind: "PRODUCT_FACTS",
      title: "all empty",
      items: [
        { key: "a", label: "A", value: "   " },
        { key: "b", label: "B", value: " " },
      ],
    };

    const markdown = renderProductFactsBlock(block);
    expect(markdown).toBeNull();
  });
});
