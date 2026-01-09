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
     * session callback（ここがSSOT）
     *
     * 目的:
     * - session.user.id を「GitHubのID」ではなく「DBのUser.id（cmi...）」にする
     *
     * 方針:
     * - email をキーに DB の user を引く
     * - 見つかったら session.user.id を DBの id に上書き
     * - 課金フィールドも同時に session.user に載せる
     */
    async session({ session, token }) {
      // まずは既存互換：token.sub があるなら一旦入れておく（※後でDB idで上書きする）
      if (token?.sub) (session.user as any).id = token.sub;

      const email = session.user?.email ?? null;
      if (!email || typeof email !== "string") {
        // email が無いとDBの user を特定できない。ここでは壊さず返す。
        return session;
      }

      try {
        const u = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true, // ✅ DBの User.id（cmi...）
            stripeCustomerId: true,
            stripeSubscriptionId: true,
            subscriptionStatus: true,
            subscriptionCurrentPeriodEnd: true,
          },
        });

        if (u?.id) {
          // ✅ 最重要：session.user.id を DBの User.id に正本化
          (session.user as any).id = u.id;
        }

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
