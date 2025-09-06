import NextAuth, { type NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";

export const authOptions: NextAuthOptions = {
  // ★ 一時的に DB Adapter を使わない JWT 方式に固定
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,

  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_ID ?? "",
      clientSecret: process.env.GITHUB_SECRET ?? "",
    }),
  ],

  // サインイン後は常に /writer へ戻す（ループ回避）
  callbacks: {
    async redirect({ baseUrl }) {
      return `${baseUrl}/writer`;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
