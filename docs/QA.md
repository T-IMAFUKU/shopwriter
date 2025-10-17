# 🧪 QA シナリオテスト（Precision Plan 準拠）

### 🎯 目的

ShopWriter の主要機能 `/api/writer` と `/writer` ページを中心に、  
**出力の安定性・応答フォーマットの厳密性・異常系の堅牢性・Draft 復元の再現性** を確認する。

---

### 🧭 実施ルール

1. テストは **Vitest + preload-env**（API 系）および **Playwright（E2E/UI 系）** で実施。
2. **現状コードを変更せず**、実際の挙動を正確に観測する。
3. 各フェーズで「改善済み／未解決／次ステップ」をレポート化。
4. **Precision Plan（B プラン）** 基準の strict shape を常時維持。

---

### 🧩 対象領域

| ID        | 検証対象                         | 概要                                                                     |
| --------- | -------------------------------- | ------------------------------------------------------------------------ |
| QA-WR-001 | `/api/writer` 基本出力           | 主要テンプレート（headline_only）での正常出力確認                        |
| QA-WR-002 | `/api/writer` フォーマット厳格性 | 余計なキー禁止・meta 構造 3 項目固定（style/tone/locale）                |
| QA-WR-003 | Draft 保存 → 復元                | `/writer` UI での保存・**自動復元（Playwright 準 E2E で通過）**          |
| QA-WR-004 | `/api/writer` 異常系堅牢性       | 不備入力時の 400 系／ok=false 応答を許容、クラッシュなしを確認           |
| QA-WR-005 | Precision Plan 再現性            | 同一入力 → 同一／許容範囲出力を確認（別枠テストで実施済）                |
| QA-WR-006 | `/api/shares` nextCursor 常在    | GET `/api/shares` で nextCursor が常在することを確認（別フェーズで維持） |

---

### 🧪 テスト構成

tests/
├── api/
│ ├── writer.qa.scenario.test.ts # strict shape & 異常系
│ ├── writer.samples.\*.test.ts # サンプル入力の正常系
│ ├── writer.snapshot.test.ts # スナップショット構造確認
│ ├── writer.precision.plan.test.ts # Precision Plan 再現性
│ └── shares.route.test.ts # 回帰確認用
└── e2e/
└── writer.draft.e2e.spec.ts # Draft 保存 → 復元 準 E2E（Playwright）

---

### 🧾 検証結果（2025-10-16 現在）

| 状態 | テスト項目  | 概要                                                              |
| ---- | ----------- | ----------------------------------------------------------------- |
| ✅   | QA-WR-001   | 正常入力で 200／strict shape（ok/data/meta/output）のみを返す     |
| ✅   | QA-WR-002   | 余計なキーなし／meta 構造固定（locale/style/tone）                |
| ✅   | QA-WR-003   | Draft 保存 →**自動復元を E2E で確認（状態同期待機版で安定通過）** |
| ✅   | QA-WR-004   | 不備入力時クラッシュなし（400 系 or ok=false）                    |
| ⚠️   | import 制約 | Next.js App Router の POST import 制約により一部 skip（環境依存） |

---

### 🧾 QA-WR-003 ｜/writer Draft 保存 → 復元（通過：2025-10-16）

#### 🎯 目的

`/writer` ページにおける **Draft（下書き）保存と自動復元** の安定性を確認。  
E2E シナリオで、入力 → 保存 → リロード → 自動復元 の再現性を検証。

#### 🧪 テスト仕様

| 項目       | 内容                                                          |
| ---------- | ------------------------------------------------------------- |
| テスト名   | QA-WR-003 ｜/writer Draft 保存 → 復元（状態待ち）             |
| 実装対象   | `app/writer/ClientPage.tsx`                                   |
| 使用テスト | `tests/e2e/writer.draft.e2e.spec.ts`                          |
| 手法       | Playwright 準 E2E（localStorage→Editor 反映まで状態同期待機） |
| 検証日     | 2025-10-16                                                    |
| 実行時間   | 約 13 秒（Chromium）                                          |

#### 🧩 通過条件

1. `data-testid="editor"` の textarea を検出できる
2. 入力内容が localStorage に保存される
3. リロード後に入力内容が自動復元される
4. 繰り返し実行でも同結果となる

#### 🧭 結果

| 検証項目          | 結果 | 備考                                   |
| ----------------- | ---- | -------------------------------------- |
| エディタ DOM 検出 | ✅   | textarea(`data-testid="editor"`)が可視 |
| 入力・保存        | ✅   | localStorage 書込 OK                   |
| 自動復元          | ✅   | リロード後も入力値を保持               |
| E2E 安定性        | ✅   | 連続実行でも安定通過                   |

> **結果：全項目 PASS（完全緑化）**

#### 💡 コメント

- hydration 競合を「状態同期待機」方式で解消。
- UI 刷新時も `data-testid="editor"`, `data-testid="save-draft"` を維持すれば、E2E 自動 QA が継続。
- Precision Plan (tests-augmented) 仕様に完全適合。

---

### 📈 今後の課題（次ステップ）

1. `/api/shares` の nextCursor 常在性を継続モニタリング。
2. QA レポートを CI（GitHub Actions）に組み込み、毎週自動検証。
3. Draft 機能の UI 統合後も E2E スイートを回帰対象に固定。

---

### 🗒️ 備考

- skip は Vitest 3.2 以降の import 制約による仕様挙動。
- 本章は **Precision Plan（tests-augmented）** コンテキストに基づく。
- 修正不要な警告（expect.skip 非対応等）は安全に無視して良い。
