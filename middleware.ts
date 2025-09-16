// middleware.ts  （全文置換）
// Next.js 14/15（App Router） / NextAuth v4 前提
import { withAuth } from "next-auth/middleware";
import type { NextRequest } from "next/server";

// ここでは「/writer と /dashboard 配下は認証必須」
// 「/share/** は常に公開（未ログインでも200）」
// 「/api/** は middleware 対象外（API側で認可）」
// 「/ は公開（トップページ）」という方針。
// 他の公開/保護パスが増えたら matcher を増減してください。

export default withAuth(
  // カスタム処理が必要ならここで NextResponse を返す
  function middleware(_req: NextRequest) {
    // 現時点では withAuth の authorized コールバックで判定するため処理なし
  },
  {
    callbacks: {
      // authorized: 「matcher で対象になったパス」に対する通過判定
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl;

        // 明示的に「公開扱い」にしたいパスは authorized=true を返す
        // ただし、これらは matcher の対象外にしているため通常ここには来ない。
        if (
          pathname === "/" || // トップページ
          pathname.startsWith("/share") // 共有ページ：常に公開
        ) {
          return true;
        }

        // それ以外（matcherに該当＝/writer, /dashboard 等）は認証必須
        // 未ログインなら 302 で /api/auth/signin へ
        return !!token;
      },
    },
    // 未認証時のリダイレクト先（NextAuth 既定で /api/auth/signin になるが明示）
    pages: {
      signIn: "/api/auth/signin",
    },
  }
);

// ★重要：matcher で「どのパスに middleware（=認証）をかけるか」を限定する。
// - /api/** は含めない（APIはサーバ側で認可）
// - /share/** は除外（常に公開）
// - /_next/**（静的/画像）や favicon などは除外
// - トップ（/）は公開のまま
export const config = {
  matcher: [
    // 認証必須にしたい領域のみを指定（安全でシンプル）
    "/writer",
    "/writer/:path*",
    "/dashboard",
    "/dashboard/:path*",
    // 必要に応じて他の保護ルートを追加：
    // "/settings",
    // "/settings/:path*",
  ],
};
