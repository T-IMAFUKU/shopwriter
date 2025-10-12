import NextAuth, { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    id: string;            // ← DBのユーザーID（string想定）
    name?: string | null;
    email?: string | null;
    image?: string | null;
  }

  interface Session {
    user: DefaultSession["user"] & {
      id: string;          // ← session.user.id を正式サポート
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
  }
}
