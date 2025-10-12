# ShopWriter UI サンプル断片（別紙 / v1.0）
本別紙は **ガイドライン v1.3-lite** の受け入れ基準に沿った「最小サンプル断片のみ」を掲載します。  
- 前提：Tailwind / shadcn/ui、P3=Bright Navy、Typography=Hybrid（H）、Shape=rounded-2xl + shadow基準  
- 目的：QA・実装レビュー時に、**同じ断片**で目視・比較・貼り付け検証ができること

---

## 1) ページヘッダ（H方針 / コンテナ）
```tsx
// /app/(any)/page.tsx などで共通利用
export function PageHeader() {
  return (
    <div className="max-w-screen-xl mx-auto px-6 md:px-8 py-6 md:py-8">
      <h1 className="text-[34px] font-bold tracking-tight">ダッシュボード</h1>
      <p className="text-[13px] text-muted-foreground mt-1">
        概要と最近のアクティビティを確認します。
      </p>
    </div>
  );
}
```
- 受け入れ基準：`h1` が **34px**、説明文が **13px muted-foreground**、左右ガター `px-6/8` であること

---

## 2) 2カラムカード（rounded-2xl / shadow-md）
```tsx
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function TwoColumnCards() {
  return (
    <div className="max-w-screen-xl mx-auto px-6 md:px-8 py-6 md:py-8">
      <div className="grid md:grid-cols-2 gap-6">
        {/* 左カード：標準 */}
        <Card className="rounded-2xl shadow-md">
          <CardHeader>
            <CardTitle className="text-[20px] font-medium">売上サマリー</CardTitle>
            <CardDescription>直近30日の集計</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-24 bg-muted rounded-lg" />
            <div className="flex justify-end">
              <Button size="sm">詳細を見る</Button>
            </div>
          </CardContent>
        </Card>

        {/* 右カード：重要（shadow-strong デモ） */}
        <Card className="rounded-2xl shadow-[0_12px_28px_rgba(0,0,0,0.16)]">
          <CardHeader>
            <CardTitle className="text-[20px] font-medium">注意が必要な項目</CardTitle>
            <CardDescription>エラー・警告の要確認</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="text-[15px] leading-7 list-disc pl-5">
              <li>連携エラー：3件</li>
              <li>未送信ドラフト：2件</li>
            </ul>
            <div className="flex justify-end">
              <Button size="sm" variant="secondary">管理画面へ</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```
- 受け入れ基準：**Card角丸=16px**、標準は `shadow-md`、重要カードは **shadow-strong**（任意値）で差別化

---

## 3) プライマリボタン（P3 / フォーカスリング）
```tsx
import { Button } from "@/components/ui/button";

export function PrimaryButtonsDemo() {
  return (
    <div className="max-w-screen-xl mx-auto px-6 md:px-8 py-6 md:py-8">
      <div className="flex flex-wrap gap-3">
        {/* P3＝Bright Navy の既定ボタン */}
        <Button
          className="focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          生成する
        </Button>

        {/* 状態ボタン（S3 採用色） */}
        <Button className="bg-[hsl(194_70%_27%)] text-white hover:bg-[hsl(194_70%_24%)]">
          成功（success デモ）
        </Button>
        <Button variant="destructive" className="bg-[hsl(0_74%_42%)] hover:bg-[hsl(0_74%_38%)]">
          エラー（destructive デモ）
        </Button>

        {/* アウトライン / ゴースト */}
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
      </div>

      <p className="text-[13px] text-muted-foreground mt-3">
        Tab でフォーカスし、<code className="font-mono">ring-primary</code> が P3 トーンで表示されることを確認。
      </p>
    </div>
  );
}
```
- 受け入れ基準：既定ボタンが **P3**、成功/エラーが **S3** の色味で表示。フォーカスリングが `ring-primary`。

---

### 備考
- 任意のページで上記コンポーネントを組み込み、**スクショで受け入れ**。  
- トークンは `app/globals.css`（P3 / S3 / Hybrid / Shape）に依存します。
