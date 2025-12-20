// app/api/auth/[...nextauth]/route.ts
// NextAuth v4 (App Router) — GitHub OAuth 前提
export const runtime = "nodejs";

import NextAuth from "next-auth";
import type { NextAuthOptions } from "next-auth";
import GitHub from "next-auth/providers/github";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Session に載せる課金フィールド（UI判定用）
 * - DB（Neon）が真実
 * - /api/auth/session が返す session.user に付与する
 */
type BillingFields = {
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string | null;
  subscriptionCurrentPeriodEnd: string | null; // Date -> ISO string
};

export const authOptions: NextAuthOptions = {
  providers: [
    GitHub({
      clientId: process.env.GITHUB_ID ?? "",
      clientSecret: process.env.GITHUB_SECRET ?? "",
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  session: { strategy: "jwt" },

  callbacks: {
    /**
     * session callback
     * - token.sub -> session.user.id
     * - session.user.email -> DB参照 -> 課金フィールドを session.user に載せる
     */
    async session({ session, token }) {
      // 既存互換：id を載せる
      if (token?.sub) (session.user as any).id = token.sub;

      // email が無ければ DB照会できないので、そのまま返す
      const email = session.user?.email ?? null;
      if (!email || typeof email !== "string") {
        return session;
      }

      try {
        const u = await prisma.user.findUnique({
          where: { email },
          select: {
            stripeCustomerId: true,
            stripeSubscriptionId: true,
            subscriptionStatus: true,
            subscriptionCurrentPeriodEnd: true,
          },
        });

        const billing: BillingFields = {
          stripeCustomerId: u?.stripeCustomerId ?? null,
          stripeSubscriptionId: u?.stripeSubscriptionId ?? null,
          subscriptionStatus: u?.subscriptionStatus ?? null,
          subscriptionCurrentPeriodEnd: u?.subscriptionCurrentPeriodEnd
            ? u.subscriptionCurrentPeriodEnd.toISOString()
            : null,
        };

        Object.assign(session.user as any, billing);
      } catch (err) {
        // Sessionを壊さない：課金情報だけ落として返す
        Object.assign(session.user as any, {
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          subscriptionStatus: null,
          subscriptionCurrentPeriodEnd: null,
        } satisfies BillingFields);

        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("NextAuth session billing enrich failed:", message);
      }

      return session;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
