import NextAuth, { type NextAuthOptions } from "next-auth";
import GitHub from "next-auth/providers/github";

// ★ ここでは "export" を付けない（Route の型エラー回避）
const authOptions: NextAuthOptions = {
  // 一時対応：DB Adapterを使わないJWT方式でループ停止
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,

  providers: [
    GitHub({
      clientId: process.env.GITHUB_ID ?? "",
      clientSecret: process.env.GITHUB_SECRET ?? "",
    }),
  ],

  // サインイン直後は /writer に固定リダイレクト
  callbacks: {
    async redirect({ baseUrl }) {
      return `${baseUrl}/writer`;
    },
  },
};

// NextAuth ハンドラをエクスポート（GET/POST のみ）
const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
