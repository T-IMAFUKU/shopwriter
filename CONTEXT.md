Set-Location -Path "C:\Users\81905\shopwriter-new"

Set-Content -Path .\CONTEXT.md -Value @'

# ShopWriter 前提条件メモ（CONTEXT.md v2）

## 0. B プラン定義（Scope）

- 目的: 「生成精度＝正確性 × 販促性 × 一貫性」
- フェーズ 1: 前提整備（プロンプト規約 / 評価 / 運用準備まで）
- 非対象: 学習データ拡張、新 UI 大改修

## 1. 開発環境（必須条件）

- Node.js：20.x
- パッケージマネージャ：pnpm 9.x
- TypeScript：5.6 以上
- フレームワーク：Next.js 15（App Router）
- DB：Neon（PostgreSQL、本番） / SQLite（開発）
- ORM：Prisma 最新
- 認証：NextAuth v4（GitHub OAuth）
- UI：shadcn/ui
- CSS：TailwindCSS
- 通知：sonner（Toast）
- カラー：ネイビーブルー基調
- 環境変数：NEXTAUTH_URL / GITHUB_ID / GITHUB_SECRET / DATABASE_URL / OPENAI_API_KEY / SHARE_DEV_BYPASS_TOKEN(dev) / FEATURE_B_PLAN
- Vercel Build Command: `pnpm prisma:generate:prod && next build`

## 2. 開発ルール

- 出力形式：最短ステップカード（番号付き、コピペ可、検証ステップ必須）
- コード提示：全文置換（差分不可）
- 作業粒度：小分け（1 レス＝ 1 ファイル）
- 使用システム明記（例：PowerShell / Next.js / Prisma / Vercel）
- 検証結果レポート：毎回「改善済み／未解決／次ステップ」で報告
- 進め方：必ず「質問確認」→「合図があって進行」
- 新チャット開始：ステップ区切りごとに極力新チャット

## 3. 実装順序

1. 契約ファイル（Zod）作成
2. サーバー処理（API）作成
3. 画面部品（UI コンポーネント）作成
4. ページ（Page）作成

- 各ステップで `pnpm typecheck` / `pnpm build` を通す

## 4. 完了条件

- 契約どおりに API / UI / Page が動作
- `pnpm typecheck` / `pnpm build` がエラーなく通る
- 必要なら動作キャプチャ確認
- 「合格」と合意して次へ進む

## 5. ループ防止ルール

1. DB とコードのズレ確認
2. 外部キー不整合（孤立データ）を先に解消
3. エラーメッセージ本文を必ず確認
4. 修正は 1 ファイル単位 → 検証 → 次へ

## 6. 生成要件（LLM 前提）

- モデル候補: 既定=高速軽量 / 高品質=切替可
- 規定値: temperature 0.7 / top_p 1.0 / max_tokens 800 / JSON Mode=必要時のみ
- プロンプト規約: 日本語 / 敬体、EC 属性優先順（商品名 > 特徴 > 素材 > サイズ > 注意書き > CTA）
- 禁止表現: 比較優劣断定 / 医薬効能
- テンプレ雛形:
  - system: トーン / 禁止事項
  - user: ブランド / 素材 / 用途 / 季節 / 価格帯 / 禁止語
  - vars: {brand, material, price_range, target, tone, length_hint}
- 失敗戦略: 欠損入力 → 短文化出力 / バリデ NG → 統一エラーメッセージ返却

## 7. データ・評価

- 評価軸: 正確性 / 自然さ / 販促性 / A11y / 法令配慮（5 段階 × 重み）
- オンライン計測: writer_start / writer_success / writer_copy / writer_abandon
- サンプルセット: 20 ケースを `/tests/samples` 管理、期待出力をスナップショット

## 8. API・サーバサイド

- 対象 API: /api/writer
- 入力スキーマ（Zod 例）: { title, brand, material, price_range, target, tone, length_hint }
- バリデ: 必須=title、日本語必須
- タイムアウト/リトライ: 20s / 1 回、フォールバック=短文要約
- ログ: PII マスク、匿名 ID 保存方針

## 9. DB・テンプレ管理

- templates: name, version, body, is_active, updated_at
- drafts: share_id, template_version, inputs_json, output_text, created_at
- 権限: 共有リンク時、PII 伏字

## 10. UI 要件

- 入力: 必須=商品名/用途、任意=素材/価格帯/トーン
- エラーメッセージ統一: 「必須です」「100 文字以内」「日本語で入力」
- 出力体裁: 見出し → 箇条書き → CTA
- コピー: notify.success("コピーしました")

## 11. ロールアウト

- Feature Flag: FEATURE_B_PLAN=true
- AB: 10%ロールアウト、停止基準=CTR/離脱率悪化
- 逆戻し: 環境変数で OFF、旧テンプレ即時切替

## 12. リスク・法令

- 禁止: 医薬的効能 / 誇大 / 比較優劣 / 権利侵害
- 自動抑制: 禁止語リスト / 弱化表現挿入
- PII 除外: 入力/ログから伏字

## 13. 運用・ドキュメント

- CONTEXT.md の章立て順守
- RUNBOOK / INDEX / CHANGELOG 更新トリガ: デプロイ / 仕様変更時
- 週次点検: /api/writer E2E / KPI 確認 / 失敗時連絡先  
  '@

## 14. API 検証の前提ルール

- **User シード必須**: Template.userId は User.id への FK。開発時は `dev-user-1` を事前に DB へ投入。
- **環境変数**:
  - `ALLOW_DEV_HEADER=1` （開発時のみ）
  - `DEBUG_TEMPLATE_API` は常時 OFF（診断時のみ一時的に ON）
- **PowerShell の注意**: URL 変数展開は必ず `${id}` を使用すること。
- **API 返却**: `{ ok, item:{ id,... } }` が基本形。id 取得は `$created.item.id`。
- **プリフライト必須**: PATCH/DELETE の前に `OPTIONS` で `Allow` を確認。想定メソッドが無い場合はルーティング/認証/リダイレクト問題を疑う。
- **検証ユーティリティ**: `scripts/api-test.ps1` を用い、POST→OPTIONS→PATCH→DELETE をワンショットで確認すること。

## 15. API デバッグ・型安全に関する追加ルール（B-2 事例より）

## API デバッグ標準（B-Plan/Server)

- 500 時は JSON で詳細返却（dev のみ）: `{ ok:false, ver, error:{ name, kind, code?, message, meta? } }`
- ルートに `ver()` を持たせ、GET で **バージョンタグ** を必ず確認してから POST/PUT/PATCH を行う
- 本番は詳細抑制（stack 非表示）。dev は詳細表示可

## PowerShell/HTTP 取扱い

- 例外時も本文を読む: **Invoke-RestMethod 単体**でまず実行
- エラー本文が欲しいときは `curl`（`-s -D -` など）も可
- `ReadAsStringAsync()` を catch で直接呼ばない（disposed 問題）

## 認証解決ポリシー

- **dev**: `X-User-Id` を許可（`ALLOW_DEV_HEADER=1`）、未指定は 401
- **prod**: NextAuth の `getServerSession` から `session.user.id` を必須解決、Dev ヘッダは無効

## Prisma/サーバ契約ルール

- `create({ data })` の `data` は **allowlist 整形**して渡す（未知キー混入を防ぐ）
- `user` など必須リレーションは **常時 `connect`** を付与
- `data` は **`satisfies Prisma.XxxCreateInput`** を使い、型不一致をビルドで検出
- 入力検証は **サーバ側 Zod**（400 で落とす）。DB 制約エラーは 500 で詳細（dev のみ）

## 検証プロトコル（API 共通）

1. **GET で ver 確認** → 期待 ver でない場合は再起動/デプロイやり直し
2. **最小 POST**で再現 → `error.kind/code` を取得して根因特定
3. **恒久修正は 1 ファイル単位**（全文置換）→ 再検証（GET/POST=200）
4. `pnpm typecheck && pnpm build` を緑にして完了判定

## 全文置換ルール（再発防止）

- 修正依頼を行う際は、必ず **現状の対象ファイルの全文** をユーザーが提出することを前提とする。

  - ファイル形式は `.txt` / `.tsx` / `.ps1` などそのまま。
  - 「このファイル修正して」と口頭で伝えるだけでは修正を開始しない。

- アシスタントは **提出された全文ファイルを基準にした全文置換のみ**を生成する。

  - 差分・抜粋・縮小版は絶対に禁止。
  - 出力の冒頭に「全文置換」と明記し、常にファイル全体を提示する。
  - 出力後に「行数が減っていないか」を自己検証する。

- このルールを破った場合、生成は無効とみなし、直前の提出ファイルを基に再生成する。

- 提出されたファイルは、同時に **バックアップの役割**を果たし、復旧の基準とする。
