// tests/densityA.test.ts
import { describe, it, expect } from "vitest";
import { buildInputSet, computeUsedSet, computeDensityA, evaluateDensityA } from "@/lib/densityA";

describe("densityA (pure logic)", () => {
  it("buildInputSet: v0 = 3 + N (product_name/goal/audience + selling_points), trims, removes empty, and dedupes (exact)", () => {
    const input = {
      product_name: "A",
      goal: "G",
      audience: "U",
      selling_points: ["x", " x ", "", "y", "y"],

      // ✅ 案1では InputSet に入れない（存在してもカウントしない）
      evidence: ["y", "z"],
      problems: ["p"],
      specs: ["s"],
    };

    const set = buildInputSet(input as any, { abstractWords: [] });

    // ✅ 案1（3+N）: product_name / goal / audience / selling_points のみ
    expect(set).toEqual(["A", "G", "U", "x", "y"]);
  });

  it("computeUsedSet: exact match", () => {
    const inputSet = ["真空二重構造で保温・保冷に対応"];
    const out = "この商品は真空二重構造で保温・保冷に対応します。";

    const { usedSet, unusedSet } = computeUsedSet(inputSet, out, { minConsecutiveMatch: 4 });
    expect(usedSet).toEqual(["真空二重構造で保温・保冷に対応"]);
    expect(unusedSet).toEqual([]);
  });

  it("computeUsedSet: consecutive match (min 4)", () => {
    const inputSet = ["真空二重構造で保温・保冷に対応"];
    const out = "真空二重構造で保温と保冷に対応します。";

    const { usedSet, unusedSet } = computeUsedSet(inputSet, out, { minConsecutiveMatch: 4 });
    expect(usedSet).toEqual(["真空二重構造で保温・保冷に対応"]);
    expect(unusedSet).toEqual([]);
  });

  it("computeUsedSet: numeric+unit match", () => {
    const inputSet = ["450ml"];
    const out = "容量は450mlです。";

    const { usedSet, unusedSet } = computeUsedSet(inputSet, out, { minConsecutiveMatch: 4 });
    expect(usedSet).toEqual(["450ml"]);
    expect(unusedSet).toEqual([]);
  });

  it("computeDensityA: used/input", () => {
    expect(computeDensityA(["a", "b"], ["a", "b", "c", "d"])).toBe(0.5);
  });

  it("evaluateDensityA: returns top3 + masked for log", () => {
    const input = {
      product_name: "タンブラー450ml",
      goal: "温度を長時間キープしたい",
      audience: "デスクワークが多い社会人",
      selling_points: ["真空二重構造", "結露しにくい"],
      evidence: ["ABC123"],
      problems: ["机が濡れる"],
      specs: ["450ml"],
    };

    const out =
      "タンブラー450mlは、作業中も飲み頃の温度が変わりにくいです。\n\n・ 真空二重構造で温度が変わりにくいです。\n・ 結露しにくく、机が濡れにくいです。\n・ 450mlで飲み物をたっぷり入れられます。";

    const r = evaluateDensityA(input as any, out, { minConsecutiveMatch: 4, logMaskMaxLen: 20 });

    expect(r.inputSet.length).toBeGreaterThanOrEqual(3);
    expect(r.usedSet.length).toBeGreaterThanOrEqual(1);

    expect(r.unusedTop3ForUi.length).toBeLessThanOrEqual(3);
    expect(r.unusedTop3ForLogMasked.length).toBeLessThanOrEqual(3);

    // "ABC123" は英数字マスクされる（***XXX みたいな形になる）
    if (r.unusedTop3ForUi.includes("ABC123")) {
      const i = r.unusedTop3ForUi.indexOf("ABC123");
      expect(r.unusedTop3ForLogMasked[i]).not.toBe("ABC123");
    }
  });
});
