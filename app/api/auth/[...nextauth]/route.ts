import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

const handler = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.GITHUB_ID || "",
      clientSecret: process.env.GITHUB_SECRET || "",
    }),
  ],
  // DB依存を外す：まずはJWTでサインイン成立を最短確認
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
  trustHost: true,
  // 期待どおり /writer に戻す
  callbacks: {
    async redirect({ url, baseUrl }) {
      // 相対パスならアプリへ
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      // 同一オリジンなら許可
      if (url.startsWith(baseUrl)) return url;
      // それ以外はホームへ
      return baseUrl;
    },
  },
  // 追加のデバッグ（本番でも一時的に役立つ）
  debug: true,
});

export { handler as GET, handler as POST };
