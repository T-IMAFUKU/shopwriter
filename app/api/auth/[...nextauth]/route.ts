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

type GitHubEmail = {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility: "public" | "private" | null;
};

async function fetchGitHubPrimaryEmail(
  accessToken: string | null | undefined
): Promise<string | null> {
  if (!accessToken || typeof accessToken !== "string") return null;

  try {
    const res = await fetch("https://api.github.com/user/emails", {
      method: "GET",
      headers: {
        Authorization: `token ${accessToken}`,
        Accept: "application/vnd.github+json",
      },
      // Next.js の fetch キャッシュ回避（ログイン時は常に最新でOK）
      cache: "no-store",
    });

    if (!res.ok) {
      console.error("GitHub emails fetch failed:", res.status, res.statusText);
      return null;
    }

    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) return null;

    const emails = data as GitHubEmail[];

    // 優先順位：primary+verified → verified → primary → 先頭
    const best =
      emails.find((e) => e?.primary && e?.verified && typeof e.email === "string") ??
      emails.find((e) => e?.verified && typeof e.email === "string") ??
      emails.find((e) => e?.primary && typeof e.email === "string") ??
      emails.find((e) => typeof e?.email === "string");

    return best?.email ?? null;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("GitHub emails fetch exception:", message);
    return null;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GitHub({
      clientId: process.env.GITHUB_ID ?? "",
      clientSecret: process.env.GITHUB_SECRET ?? "",
      allowDangerousEmailAccountLinking: true,
      // ✅ 恒久強め：email 取得確率を上げる（必要時に /user/emails を叩ける）
      authorization: { params: { scope: "read:user user:email" } },
    }),
  ],
  session: { strategy: "jwt" },

  callbacks: {
    /**
     * signIn callback
     *
     * 目的:
     * - GitHub ログイン成功時に DB の User を必ず upsert して「User not found」を再発させない
     *
     * 方針:
     * - 基本は user.email を使用
     * - 無い場合は GitHub API /user/emails から primary/verified を補完
     * - email が確定したら upsert（無料ユーザー含む）
     */
    async signIn({ user, account }) {
      // 1) まず NextAuth が持っている email を使う
      let email =
        user?.email && typeof user.email === "string" ? user.email : null;

      // 2) 無い場合は GitHub API で補完（scope 付与済み前提）
      if (!email) {
        const token =
          account?.provider === "github" ? account?.access_token : null;
        email = await fetchGitHubPrimaryEmail(token);
      }

      // 3) それでも email が無い場合、DBキーが作れないので「ログイン自体は壊さない」
      //    （ただし目的上は問題なので、ログに強く残す）
      if (!email) {
        console.error(
          "NextAuth signIn upsert skipped: email is missing (GitHub account may not expose email)."
        );
        return true;
      }

      const name = user?.name && typeof user.name === "string" ? user.name : null;
      const image =
        user?.image && typeof user.image === "string" ? user.image : null;

      try {
        await prisma.user.upsert({
          where: { email },
          update: {
            // 既存ユーザーの表示情報だけ同期（課金フィールド等は別系統で更新される前提）
            name,
            image,
          },
          create: {
            email,
            name,
            image,
          },
          select: { id: true },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("NextAuth signIn upsert failed:", message);
        // ログインを壊さない（ただし upsert できないと downstream で困るのでログで追跡）
      }

      return true;
    },

    /**
     * jwt callback
     *
     * 目的:
     * - session callback でDB lookup するための email を token に確実に載せる
     *
     * 方針:
     * - user.email があれば採用
     * - 無ければ GitHub API で補完して token.email に保存
     */
    async jwt({ token, user, account }) {
      // user があるのは基本「初回サインイン時」
      const directEmail =
        user?.email && typeof user.email === "string" ? user.email : null;

      if (directEmail) {
        (token as any).email = directEmail;
        return token;
      }

      // 既に token.email があるなら何もしない
      const existing =
        (token as any)?.email && typeof (token as any).email === "string"
          ? ((token as any).email as string)
          : null;

      if (existing) return token;

      // GitHub の初回サインイン時に補完（access_token があるときのみ）
      if (account?.provider === "github") {
        const email = await fetchGitHubPrimaryEmail(account.access_token);
        if (email) (token as any).email = email;
      }

      return token;
    },

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

      // ✅ email のSSOT：session.user.email が無ければ token.email を使う
      const emailFromSession =
        session.user?.email && typeof session.user.email === "string"
          ? session.user.email
          : null;

      const emailFromToken =
        (token as any)?.email && typeof (token as any).email === "string"
          ? ((token as any).email as string)
          : null;

      const email = emailFromSession ?? emailFromToken ?? null;

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
