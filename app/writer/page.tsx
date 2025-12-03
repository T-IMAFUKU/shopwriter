// app/writer/page.tsx
// LEVEL3-final：ThinkingOverlay をページに常時マウント
// Precision Plan準拠：UI本体は ClientPage に集約。
// ここでは searchParams から productId を受け取り、ClientPage に渡すのみ。

export const runtime = "edge";
export const dynamic = "force-dynamic";

import ClientPage from "./ClientPage";
import ThinkingOverlay from "./components/ThinkingOverlay";

export default function Page({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const productIdParam = searchParams?.productId;
  const productId =
    typeof productIdParam === "string" ? productIdParam : null;

  return (
    <>
      {/* 擬似思考ログ（生成中の回転＆完了後の自然フェード） */}
      <ThinkingOverlay />

      {/* UI本体（productId を受け渡し） */}
      <ClientPage productId={productId} />
    </>
  );
}
