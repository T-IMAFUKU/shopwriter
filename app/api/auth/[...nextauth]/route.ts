import NextAuth from "next-auth"
import GitHub from "next-auth/providers/github"
import { PrismaAdapter } from "@next-auth/prisma-adapter"
import { prisma } from "@/lib/prisma"

export const authOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GitHub({
      clientId: process.env.GITHUB_ID!,
      clientSecret: process.env.GITHUB_SECRET!,
    }),
  ],
  session: { strategy: "jwt" as const }, // まずはJWTでセッション確立
  pages: { signIn: "/api/auth/signin" },
  debug: process.env.NEXTAUTH_DEBUG === "true",
}

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }
