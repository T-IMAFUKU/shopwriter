// middleware.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * 方針：
 * - /api は絶対に通さない（ミドルウェアの影響ゼロ）
 * - 静的/内部パス（_next, 静的ファイル）も対象外
 * - それ以外（ページ遷移系）は将来の拡張に備えて素通り（no-op）
 */

export function middleware(_req: NextRequest) {
  // 何もしない（素通り）
  return NextResponse.next();
}

/**
 * matcher の重要ポイント：
 * - `((?!api|_next|.*\\..*).*)` で /api と /_next と拡張子付き静的資産を完全除外
 * - /share/* などの公開ビューはここで素通りさせる（ロジックは後続で実装可能）
 */
export const config = {
  matcher: [
    // すべての /api を除外、/ _next / 静的ファイルも除外（例: .png, .svg, .ico, .js, .css など）
    "/((?!api|_next|.*\\..*).*)",
  ],
};
