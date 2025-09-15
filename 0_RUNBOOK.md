## 2025-09-14 共有UI整備 — shadcn/ui 適用 + トースト + ShareCard
- /share/[id] を shadcn/ui `<Button/>` / `<Alert/>` に統一
- sonner トースト導入（コピー成功/失敗を右上通知）
- `components/share/ShareCard.tsx` 新規作成、`/app/share/[id]/page.tsx` は取得/エラー処理へ責務分離
- E2E確認：`/api/shares/dev-bypass-123456`=200, `/api/shares/dev-bypass`=404 をUIで検証（OK）
- 影響範囲：フロントのみ（DB/Prisma 変更なし）
- 次予定：Dashboard等で ShareCard 再利用／ErrorAlert 切り出し／UI基準の統一
