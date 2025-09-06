import NextAuth, { type NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";

/**
 * NextAuth を JWT セッションに固定して、DBセッション依存を排除。
 * これにより、/writer でのリダイレクト・ループを解消します。
 *
 * 必要な環境変数（Vercel Production）：
 * - NEXTAUTH_URL=https://shopwriter-next.vercel.app
 * - NEXTAUTH_SECRET=（OpenSSL等で生成したランダム文字列）
 * - GITHUB_ID=（GitHub OAuth App の Client ID）
 * - GITHUB_SECRET=（GitHub OAuth App の Client Secret）
 */
export const authOptions: NextAuthOptions = {
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_ID ?? "",
      clientSecret: process.env.GITHUB_SECRET ?? "",
      // scope等の追加が必要ならここで調整
    }),
  ],
  session: {
    strategy: "jwt", // ★ ループ原因になりやすいDBセッションを不使用にする
    maxAge: 60 * 60 * 24 * 7, // 7日（任意）
  },
  // Vercel本番でのCookieは自動的にSecure/Laxになるが、明示してもOK
  cookies: {
    // ここは既定のままでも問題なし。必要に応じて上書き可能。
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      // 初回ログイン時にアクセストークン/ID等を転記したい場合はここで
      // 今回は最小限：そのまま返す
      return token;
    },
    async session({ session, token }) {
      // UIで user.id が必要な場合に備えて sub を付与（任意）
      if (session.user && token?.sub) {
        // @ts-expect-error - 追加プロパティ
        session.user.id = token.sub;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      // 外部ドメインへの遷移を禁止しつつ、サインイン後は /writer に寄せる（任意）
      if (url.startsWith(baseUrl)) return url;
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      return `${baseUrl}/writer`;
    },
  },
  // デバッグしたいときのみ true（本番はfalse推奨）
  debug: false,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
