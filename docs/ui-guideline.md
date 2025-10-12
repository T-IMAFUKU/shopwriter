# ShopWriter UI ガイドライン（軽量版 / v1.3-lite）
**CP**: CP@2025-09-21.v3-compact（tests-augmented）  
**対象**: MVP範囲の実装・QAでのUI統一  
**想定ページ**: /dashboard, /writer, /templates, /shares など  
**原則**: 「最小・一貫・検証可能」。この文書は**受け入れ基準**であり、細部は Tailwind と shadcn/ui のプリセットで運用する。

---

## 1. トークン（デザイントークン基準）
### 1.1 角の丸さ（Radius）— **決定**
- **button / input**: `rounded-lg`（8px）
- **card / dialog / dropdown**: `rounded-2xl`（16px）✅
- **badge**: `rounded-full`
- **ページ主要見出し容器**（必要時）: `rounded-xl`（12px）
> 角丸は**混在させない**：1ビュー内で `rounded-lg`（操作系） と `rounded-2xl`（容器系）に限定。

### 1.2 影（Shadow）— **決定**
- **sm**: `shadow-sm`（入力・軽要素）  
- **md**: `shadow-md`（既定。軽い立体感）  
- **strong**: `shadow-[0_12px_28px_rgba(0,0,0,0.16)]`（**比較v2で採用**。Card/Dialog など重要要素に限定）✅
> ルール: 1ビュー内で**最大2ランク**まで（例：`sm + strong` / `md + strong`）。  
> 全面強調は疲労感を生むため**strongは要所のみ**。

### 1.3 余白（Spacing）— **決定**
- **ページ左右ガター**: `px-6 md:px-8`
- **セクション上下**: `py-6` ✅
- **カード内**: `p-4` ✅
- **フォーム行間**: `space-y-4`
- **ツールバー**: `gap-3`
> `py-8` 以上はタブレットで間延びしやすいため原則不採用。

### 1.4 配色（Color）— **決定：Primary = P3（Bright Navy）**
- **Primary**: **#1E3A5F**（H≈214°, S≈52%, L≈24.5%）  
  - 用途：ボタン/リンク/強調、チャート強調線、アクティブ状態  
  - 例：`bg-primary text-primary-foreground`, `text-primary`, `ring-primary`
- **Foreground**（標準テキスト）: `foreground`  
- **Muted / Muted-foreground**（補助）: `muted` / `muted-foreground`
- **Border**: `border`（区切り線）
- **Background**: `background`（ページ背景）
> ルール: HEX直書きは**禁止**。**必ずトークン**（Tailwind + shadcn/ui）で指定。

### 1.5 タイポグラフィ（Typography）— **決定：H（折衷 / Hybrid）**
- **方針**: 「本文＝Eベース」「見出し＝D寄り（+1段）」で調和  
  - 本文は軽く明瞭（text-[15px]）  
  - 見出しは存在感を確保（H1=34px, H2=22px）
- **h1**: `text-[34px] font-bold tracking-tight`
- **h2**: `text-[22px] font-semibold tracking-tight`
- **h3**: `text-[20px] font-medium`
- **本文（Body）**: `text-[15px] leading-7 text-foreground`
- **補助（Small）**: `text-[13px] text-muted-foreground`
- **キャプション**: `text-[11px] uppercase tracking-wide text-muted-foreground`
- **数値**: `tabular-nums`
- **リンク**: `text-primary hover:underline underline-offset-4`

---

## 2. レイアウト原則
- **コンテナ幅**: `max-w-screen-xl mx-auto`
- **グリッド**: `grid grid-cols-1 md:grid-cols-12 gap-6`
  - **主要カード**: `md:col-span-8`、**補助カード**: `md:col-span-4`
- **空状態**: アイコン（24px）+ 見出し（h3）+ 補助文（muted）+ プライマリボタン

---

## 3. コンポーネント既定（shadcn/ui）
### 3.1 Button
- **サイズ**: 既定 `h-9 px-4` / ラージ `h-10 px-6`
- **バリアント**: `default(primary)`, `secondary`, `outline`, `destructive`, `ghost`, `link`
- **アクセシビリティ**: アイコンのみは `aria-label` 必須。ラベルは動詞始まり。

### 3.2 Input / Textarea / Select
- **角丸**: `rounded-lg`（8px）
- **影**: `shadow-sm`（必要時）
- **高さ**: Input `h-10`、Textarea `min-h-[120px]`
- **フォーカス**: `focus-visible:ring-2 focus-visible:ring-primary`
- **エラー**: `text-xs text-destructive mt-1`

### 3.3 Card
- **角丸**: `rounded-2xl`（16px）
- **影**: 既定は `shadow-md`、**重要カード/モーダルは `shadow-[0_12px_28px_rgba(0,0,0,0.16)]`（strong）**
- **構成**: `Card` + `CardHeader` + `CardContent` (+ `CardFooter`)
- **ヘッダ**: タイトル h3、補助 `text-sm text-muted-foreground`

### 3.4 Table
- **行高**: `h-11`
- **ヘッダ**: `text-xs uppercase tracking-wider text-muted-foreground`
- **セル**: `text-sm`
- **数値列**: 右寄せ + `tabular-nums`

### 3.5 Dialog / Dropdown / Toast
- **Dialog**: `rounded-2xl` + **`shadow-[0_12px_28px_rgba(0,0,0,0.16)]`** + `p-6`
- **Dropdown**: `text-sm`、セパレータでグループ化
- **Toast (sonner)**: 成功=2600ms／エラー=4000ms、同時表示2件まで

---

## 4. フォーム規約
- **ラベル**: 上配置 `Label`、必須は末尾 `*`（`aria-required="true"`）
- **並び**: 1カラム（横並びはツールバーのみ）
- **バリデーション**: 短い日本語＋具体（サーバ／クライアントで統一）
- **CTA**: 下端右寄せ（取消=secondary → 確定=primary）

---

## 5. アイコン＆画像
- **アイコン**: lucide-react（16 / 20 / 24px）
- **配置**: ボタン内は左 `mr-2`、視線起点を揃える
- **画像**: 背景透過または `rounded-lg`

---

## 6. アクセシビリティ（A11y）
- **コントラスト**: WCAG AA 以上（Primary 上の文字は白系 `primary-foreground`）
- **キーボード**: `Tab` 順序の論理性、`focus-visible` 必須
- **aria**: アイコンボタン／モーダル／空状態に適切な役割とラベル

---

## 7. 受け入れ基準（QA チェックリスト）
- **Radius**：button/input=8px（`rounded-lg`）、card/dialog=16px（`rounded-2xl`）  
- **Shadow**：`shadow-sm`（軽要素）／`shadow-md` または **`shadow-[0_12px_28px_rgba(0,0,0,0.16)]`**（要所）  
- **Spacing**：カード `p-4`、セクション `py-6`、ツールバー `gap-3`  
- **Color**：**Primary=#1E3A5F** をトークン運用（直書き禁止）  
- **Typography（H準拠）**：h1=34px、h2=22px、本文15px、補助13px、caption11px（`/dev/ui-compare/typography-hybrid` と一致）  
- **Table**：数値は右寄せ＋`tabular-nums`  
- **Form**：ラベル上、必須 `*`、エラーは赤  
- **Toast**：成功2600ms／エラー4000ms、重複2以下  
- **A11y**：`focus-visible` と `aria-label` の欠落なし

---

## 8. サンプル断片（**別紙**）
- 本ドキュメントを軽量化するため、サンプルコードは **別紙** に分離しました。  
- 別紙: [`docs/ui-samples.md`](./ui-samples.md)  
- 項目: 「ページヘッダ」「2カラムカード」「プライマリボタン（P3色）」

---

## 9. 禁則（Do / Don’t）
- **Don’t**: HEX直書き、角丸の混在（`rounded-sm` と `rounded-2xl` を同居）  
- **Don’t**: 影3ランク以上の乱用、`mt-1.5` 等の微妙な余白バラつき  
- **Do**: トークン化・コンポーネント再利用・スクショ比較の徹底

---

## 10. 運用
- 変更は **このファイルを唯一の基準** とし、PRで差分提示  
- 破壊的更新は `v1.x` → `v2.0` として扱う  
- UI差分の議論は**スクリーンショット**＋該当クラス（Tailwind）を添付

© 2025 ShopWriter