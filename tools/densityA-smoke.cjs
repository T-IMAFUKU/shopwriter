// tools/densityA-smoke.cjs
// 密度Aロジックのスモーク（副作用なし・UI変更なし）
// 実行: node tools/densityA-smoke.cjs

const { evaluateDensityA } = require("../lib/densityA.ts"); // tsを直接requireできない環境だと失敗します

// ↑が失敗する場合：このスクリプトは “動作例” として残し、
// プロジェクト側のテスト基盤（vitest/jest/ts-node等）に合わせて後で差し替えます。
// まずはロジックの実装完了が目的。

const input = {
  product_name: "ステンレス製 真空断熱タンブラー 450ml",
  selling_points: ["真空二重構造で保温・保冷に対応", "結露しにくく、デスク周りが濡れない", "シンプルなデザインで男女問わず使える"],
  evidence: ["450ml", "ステンレス製"],
  problems: ["飲み物の温度を長時間保ちたい"],
  specs: ["容量：450ml"],
};

const outputText = `
ステンレス製真空断熱タンブラー450mlは、デスクでのリフレッシュタイムにぴったり。
・真空二重構造で保温・保冷が可能です
・結露しにくく、デスク周りが濡れにくい設計です
・シンプルなデザインで使いやすいです
`;

const r = evaluateDensityA(input, outputText, {
  minConsecutiveMatch: 4,
  abstractWords: [], // 今回は未使用（辞書が決まってから有効化）
});

console.log("densityA =", r.densityA);
console.log("inputSet =", r.inputSet);
console.log("usedSet =", r.usedSet);
console.log("unusedSet =", r.unusedSet);
console.log("unusedTop3ForUi =", r.unusedTop3ForUi);
console.log("unusedTop3ForLogMasked =", r.unusedTop3ForLogMasked);
