import NextAuth from "next-auth";
import type { NextAuthOptions } from "next-auth";
import GitHub from "next-auth/providers/github";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { PrismaClient } from "@prisma/client";

// Prisma Client（開発時の多重生成を防止）
const prisma = (globalThis as any).__prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") (globalThis as any).__prisma = prisma;

// ※ authOptions を「定義はしても export しない」ことが重要（Routeの型要件）
const options: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GitHub({
      clientId: process.env.GITHUB_ID ?? "",
      clientSecret: process.env.GITHUB_SECRET ?? "",
    }),
  ],
  // 必要ならここに callbacks や session 設定を追加
};

const handler = NextAuth(options);
export { handler as GET, handler as POST };
