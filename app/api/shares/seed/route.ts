// app/api/shares/seed/route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

// 🔐 注意：開発専用の簡易シード。DB確認用に一時的に使います。
// 本番デプロイ前に必ず削除 or ガードを追加してください。
const prisma =
  (globalThis as any).__prisma__ ?? new PrismaClient({ log: ["error"] });
if (process.env.NODE_ENV !== "production") {
  (globalThis as any).__prisma__ = prisma;
}

export async function POST() {
  try {
    // 既存件数（重複作成を避けるため）
    const count = await prisma.share.count();
    if (count > 0) {
      return NextResponse.json(
        { ok: true, message: "shares テーブルに既にデータがあります。", count },
        { status: 200 }
      );
    }

    const now = new Date();
    const items = await prisma.share.createMany({
      data: [
        {
          // id は cuid() で自動
          userId: "dev-user", // 認証導入前の暫定値
          title: "秋のセールLP原稿（ドラフト）",
          createdAt: new Date(now.getTime() - 1000 * 60 * 60 * 36), // 36時間前
          expiresAt: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 10), // 10日後
        },
        {
          userId: "dev-user",
          title: "トップページ見出し案 v2",
          createdAt: new Date(now.getTime() - 1000 * 60 * 60 * 10), // 10時間前
          // expiresAt なし
        },
      ],
    });

    return NextResponse.json(
      { ok: true, inserted: items.count },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[POST /api/shares/seed] error:", err);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "シード処理でエラーが発生しました。",
        },
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
