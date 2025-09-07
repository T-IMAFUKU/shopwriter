// 使用システム: Next.js(App Router) / NextAuth v4 / TypeScript
import NextAuth from "next-auth";
import GithubProvider from "next-auth/providers/github";

export const runtime = "nodejs"; // edgeでも可。まずはnodejsで安定運用

const handler = NextAuth({
  // ✅ プロバイダ
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_ID!,
      clientSecret: process.env.GITHUB_SECRET!,
      // Callback:
      //  - ローカル:  http://localhost:3000/api/auth/callback/github
      //  - 本番:    https://shopwriter-next.vercel.app/api/auth/callback/github
    }),
  ],

  // ✅ セッション/シークレット
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,

  // 🔎 必要時のみ一時ON
  // debug: true,

  // ※ trustHost は削除（型エラー回避）
});

export { handler as GET, handler as POST };
