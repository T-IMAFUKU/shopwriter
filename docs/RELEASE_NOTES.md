# 🧾 ShopWriter v1.0.0 リリースノート

**リリース日**：2025-10-13  
**タグ**：`v1.0.0`  
**ブランチ**：`main`（安定版）

---

## 🚀 主な変更点

### 1. Hero／OG 整合

- トップページ Hero の改行・文区切りを OG 画像と統一。
- `app/opengraph-image.tsx` における背景エラーを解消し安定描画。

### 2. UI・ビルド品質

- shadcn/ui の標準化・UI 統一完了（角丸・影・余白統一）。
- Toast 通知（sonner）を本番対応済み（エラー時 4000ms / 成功時 2600ms）。

### 3. API・テスト

- `/api/shares` の `nextCursor` 常在化。
- `/api/writer` スキーマを strict 仕様（CP@2025-09-21.v3）で確定。
- 全体テスト緑化（`pnpm test`＝ ✅）。

### 4. デプロイ

- Vercel 環境変数設定完了：
  - `DATABASE_URL`（Neon Postgres）
  - `NEXTAUTH_URL`
  - `GITHUB_ID` / `GITHUB_SECRET`
- `Build Command`：`pnpm prisma:generate:prod && next build`
- 本番 `/api/shares`＝`Unauthorized` を期待値として検証完了。

---

## 🧩 リリース構成

| 項目    | 値                      |
| ------- | ----------------------- |
| Node    | 20.x                    |
| Next.js | 15                      |
| Prisma  | 6.15                    |
| DB      | Neon (PostgreSQL)       |
| Host    | Vercel                  |
| Auth    | GitHub OAuth            |
| UI      | shadcn/ui + TailwindCSS |

---

## 🔭 今後の展望（v1.1〜）

- Writer UX 改善（リアルタイム生成プレビュー）
- Dashboard 強化（利用履歴・EventLog グラフ拡張）
- Monetization フェーズ（Stripe 決済統合）

---

© 2025 Inovista Inc. / ShopWriter Project
