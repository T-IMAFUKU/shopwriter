\# QA.md（ShopWriter 品質検証レポート）

\## 1. Precision Plan 実測テスト結果（2025-10-15）

\### 実行環境

\- NODE_OPTIONS: `--require=./tests/preload-env.cjs`

\- テストファイル: `tests/api/writer.precision.plan.test.ts`

\- OpenAI キー: 有効（LEN=164）

\- 実行コマンド: `pnpm run test:precision`

\### 結果サマリ

```json
{
  "precision_plan_summary": {
    "N": 3,
    "unique_outputs": 3,
    "avg_token_overlap": 0.467,
    "time_ms": {
      "min": 1039,
      "avg": 1190,
      "max": 1275
    },
    "samples": [
      "「Precision Planで未来を見据えた戦略を！」",
      "「Precision Planで、理想の未来を手に入れよう！」",
      "「Precision Planで、あなたの目標達成を加速させよう！」"
    ],
    "metas": [{}, {}, {}]
  }
}
```
