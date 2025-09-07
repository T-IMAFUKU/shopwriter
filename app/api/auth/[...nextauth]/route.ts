// 使用システム: Next.js(App Router) / NextAuth v4 / TypeScript
import NextAuth from "next-auth";
import GithubProvider from "next-auth/providers/github";

export const runtime = "nodejs"; // edgeでも可。cookie周りの相性はnodejsが安定

const handler = NextAuth({
  // ✅ 必須: 少なくとも1つのプロバイダ
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_ID!,
      clientSecret: process.env.GITHUB_SECRET!,
      // GitHub 側の Callback:
      //   http://localhost:3000/api/auth/callback/github（ローカル）
      //   https://<本番ドメイン>/api/auth/callback/github（本番）
      // scope は既定で "read:user user:email"。明示したい場合は下記をコメント解除
      // authorization: { params: { scope: "read:user user:email" } },
    }),
  ],

  // ✅ よくある原因（secret/URL）を明示
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  trustHost: true,

  // 🔎 切り分け用（必要な時だけ true に）
  // debug: true,

  // 任意: 追加のログ/リダイレクト制御（デバッグ時に有用）
  // callbacks: {
  //   async redirect({ url, baseUrl }) {
  //     // 相対URLはOK、同一オリジンの絶対URLもOK
  //     if (url.startsWith("/")) return `${baseUrl}${url}`;
  //     if (new URL(url).origin === baseUrl) return url;
  //     return baseUrl;
  //   },
  // },
});

export { handler as GET, handler as POST };
