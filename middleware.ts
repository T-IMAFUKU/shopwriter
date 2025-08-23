export { default } from "next-auth/middleware";

export const config = {
  matcher: ["/writer/:path*", "/dashboard/:path*", "/api/drafts/:path*"],
};
