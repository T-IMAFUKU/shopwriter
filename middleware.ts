// middleware.ts
// Auth Guard (NextAuth v4)
// - 目的: 未ログイン状態での /products /account/* /dashboard などのアクセスを防ぐ
// - 方針: 公開ページは通す / 保護ページはトークン必須
// - 注意: middleware は Edge で動く（DBアクセスはしない）

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

const PUBLIC_PATHS: string[] = [
  "/", // トップ
  "/help", // ヘルプ
  "/share", // 共有ページ（もし /share/* がある前提なら許可）
  "/pricing", // もし存在するなら（無くても害はない）
  "/plans", // もし存在するなら（無くても害はない）
];

const PROTECTED_PREFIXES: string[] = [
  "/dashboard", // ダッシュボード一式
  "/products", // 商品情報管理（今回）
  "/account", // 請求情報など（/account/billing 等）
];

function isPublicPath(pathname: string): boolean {
  // 完全一致 or 配下を許可
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1) 公開ページは素通し
  if (isPublicPath(pathname)) return NextResponse.next();

  // 2) 保護ページ以外は素通し（今は“必要なところだけ”守る）
  if (!isProtectedPath(pathname)) return NextResponse.next();

  // 3) 保護ページは NextAuth token 必須
  const secret = process.env.NEXTAUTH_SECRET;
  const token = await getToken({ req, secret });

  if (token) return NextResponse.next();

  // 未ログインは NextAuth の signin へ（戻り先付き）
  const signInUrl = req.nextUrl.clone();
  signInUrl.pathname = "/api/auth/signin";
  signInUrl.searchParams.set("callbackUrl", req.nextUrl.href);

  return NextResponse.redirect(signInUrl);
}

export const config = {
  matcher: [
    // /api, /_next, 拡張子付きファイル（.png .css 等）を除外してページだけ middleware 対象
    "/((?!api|_next|.*\\..*).*)",
  ],
};
