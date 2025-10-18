import type { Metadata } from "next";

/**
 * Writer セクション用レイアウト（ローカルヘッダーは描画しない）
 * - グローバルヘッダーは app/layout.tsx 側で提供
 * - children をそのまま描画して重複を回避
 */
export const metadata: Metadata = {
  title: "Writer | ShopWriter",
  description:
    "商品説明・LP導入文・SNS文面などを最短3ステップで生成。ブランドトーンを維持しながら販売導線へ直結するWriter。",
};

export default function WriterSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

