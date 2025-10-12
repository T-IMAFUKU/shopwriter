import { PrismaClient } from "@prisma/client";

/**
 * PrismaClient をアプリ全体で単一インスタンスにする初期化ユーティリティ。
 * - 開発時: グローバルに保持してホットリロードでも再生成しない
 * - 本番時: 通常生成
 * - ログ: 最小限（必要に応じて調整）
 */
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

export const prisma =
  global.prisma ??
  new PrismaClient({
    log: ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}

export default prisma;
