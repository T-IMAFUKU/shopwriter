export const dynamic = "force-dynamic";
export const revalidate = 0;

import ClientPage from "./ClientPage";

/**
 * /writer ページは Server 薄皮 → ClientPage を描画
 * - Server 側では async 関数のみ export
 * - hooks は ClientPage 側に集約
 */
export default async function Page() {
  return <ClientPage />;
}
