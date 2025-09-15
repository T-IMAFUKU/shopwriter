/**
 * types/next-auth.d.ts
 * NextAuth セッション型を拡張し、user.id を追加
 * → 本番ビルド時の型エラー解消用
 */
import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      /** ユーザー名（任意） */
      name?: string | null;
      /** メールアドレス（GitHub OAuthなどで付与される） */
      email?: string | null;
      /** プロフィール画像URL */
      image?: string | null;
      /** 内部識別子（Providerにより存在、今回のビルドエラー解消対象） */
      id?: string | null;
    };
  }

  interface User {
    id?: string | null;
  }
}
