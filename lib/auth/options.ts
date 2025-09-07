import type { NextAuthOptions } from "next-auth";
import GithubProvider from "next-auth/providers/github";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_ID ?? "",
      clientSecret: process.env.GITHUB_SECRET ?? "",
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (account && user) {}
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = session.user.email ?? (token.email as string | undefined);
        session.user.name = session.user.name ?? (token.name as string | undefined);
      }
      return session;
    },
  },
};
