# 🏷️ ShopWriter タグ & ブランチ運用ガイド

最終更新日: 2025-10-13  
対象リポジトリ: T-IMAFUKU/shopwriter-new  
対象タグ: v1.0.0（安定版リリース）

---

## 運用方針

ShopWriter では、「安全に再現できる状態」をタグで固定する運用を採用。  
リリースごとに以下を行うことで、本番・検証環境の整合性を担保します。

---

## タグ運用ルール

| タイプ               | 命名例        | 用途                      |
| -------------------- | ------------- | ------------------------- |
| 本番リリース         | v1.0.0        | Vercel 本番反映バージョン |
| 開発安定版           | v1.0.0-rc1    | main 直前の安定候補       |
| 検証スナップショット | test-YYYYMMDD | QA / ローカルテスト記録用 |

---

## タグ付与手順

(以下を PowerShell で実行)

# 1. main ブランチを最新化

git checkout main
git pull origin main

# 2. タグ付与

git tag -a v1.0.0 -m "release: ShopWriter v1.0.0 (Hero 整合・OG 安定・全体緑化)"

# 3. タグをリモートへ送信

git push origin v1.0.0

備考: git push origin --tags は複数タグ一括送信時のみ推奨。

---

## ブランチ命名規則

| 種別         | 命名例             | 備考                     |
| ------------ | ------------------ | ------------------------ |
| メイン       | main               | 本番稼働ブランチ         |
| 開発         | feat/ui-final-pass | 機能単位で分岐           |
| 修正         | fix/api-schema     | バグ・ホットフィックス用 |
| ドキュメント | docs/release-notes | ドキュメント更新用       |

---

## Vercel 連携ルール

| 環境       | 対応ブランチ   | 備考                                 |
| ---------- | -------------- | ------------------------------------ |
| Production | main           | 自動デプロイ（タグ付きコミット推奨） |
| Preview    | feat/_ / fix/_ | PR 作成時に自動プレビュー            |

Build Command:
pnpm prisma:generate:prod && next build

---

## リリース手順チェックリスト

- [x] main 最新化済み
- [x] 全テスト緑化 (pnpm test)
- [x] バージョン番号更新済み (package.json)
- [x] タグ作成・push 済み
- [x] Vercel Deploy 確認済み

---

## 次バージョン（v1.1〜）方針

- タグ体系維持 (v1.1.0, v1.1.0-rc1)
- CHANGELOG と同期
- PR タイトルを「release: vX.Y.Z」で統一

---

© 2025 Inovista Inc. / ShopWriter Project
