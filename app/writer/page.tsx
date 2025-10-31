// app/writer/page.tsx
// /writer のページエントリ。
// Precision Plan準拠: UIロジックは ClientPage に集約し、ここでは環境指定と呼び出しのみ行う。

export const runtime = "edge";         // ← 本番が edge の場合
export const dynamic = "force-dynamic";

import ClientPage from "./ClientPage";

export default function Page() {
  return <ClientPage />;
}
