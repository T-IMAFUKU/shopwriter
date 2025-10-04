export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { ReactNode } from "react";

/** /writer 配下をサブツリーごと“動的レンダリング”に固定する薄皮レイアウト */
export default function WriterLayout({ children }: { children: ReactNode }) {
  return children;
}
