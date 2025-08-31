export { default } from "next-auth/middleware"

export const config = {
  // 認証が必要なパスだけ。/api/auth/* は含めない！
  matcher: ["/writer"],
}
