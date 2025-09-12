import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

function maskUrl(raw?: string | null) {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const user = u.username || "";
    const host = u.host;
    const db = u.pathname.replace(/^\//, "");
    const sslmode = u.searchParams.get("sslmode");
    const isPooler = /-pooler\./.test(host);
    // パスワードはマスク
    return {
      scheme: u.protocol.replace(":", ""),
      user,
      host,
      database: db,
      sslmode,
      isPooler,
      // 参考：完全な URL の可視化は避ける
    };
  } catch {
    return { parseError: true, raw };
  }
}

export async function GET() {
  const DATABASE_URL = process.env.DATABASE_URL ?? null;

  // 実際に Prisma 接続を試す
  const prisma = new PrismaClient({ log: ["error", "warn"] });
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>("select version();");
    const version = rows?.[0]?.version ?? null;
    return NextResponse.json({
      ok: true,
      version,
      env: {
        hasDATABASE_URL: !!DATABASE_URL,
        parsed: maskUrl(DATABASE_URL),
      },
    });
  } catch (e: any) {
    // 失敗時は詳細を返す（開発のみ詳細）
    const detail =
      process.env.NODE_ENV === "production"
        ? undefined
        : {
            name: e?.name,
            message: e?.message,
            code: e?.code,
            meta: e?.meta,
          };
    return NextResponse.json(
      {
        ok: false,
        error: "DB_CONNECTION_FAILED",
        env: {
          hasDATABASE_URL: !!DATABASE_URL,
          parsed: maskUrl(DATABASE_URL),
        },
        detail,
      },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
