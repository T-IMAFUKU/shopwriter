// app/writer/page.tsx
// LEVEL3-final：ThinkingOverlay をページに常時マウント（ClientPageはそのまま）
// Precision Plan準拠：UI本体は ClientPage に集約。ここは環境宣言＋コンポーネント配置のみ。

export const runtime = "edge";
export const dynamic = "force-dynamic";

import ClientPage from "./ClientPage";
import ThinkingOverlay from "./components/ThinkingOverlay";

export default function Page() {
  return (
    <>
      {/* 擬似思考ログ（生成中の回転＆完了後の自然フェード） */}
      <ThinkingOverlay />
      {/* 本体 */}
      <ClientPage />
    </>
  );
}
