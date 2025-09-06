// app/api/db/ping/route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET() {
  try {
    // Neon(PostgreSQL) に実接続してバージョンを1行取得
    const rows = await prisma.$queryRaw<{ version: string }[]>`SELECT version() AS version`;
    const version = rows?.[0]?.version ?? "unknown";

    // 追加で単純な書き込み/読み取りの健全性を見たい場合は
    // アプリのテーブル完成後に簡易クエリを足すとよい（今回は最小）
    return NextResponse.json({ ok: true, version }, { status: 200 });
  } catch (err: any) {
    // Prisma/DB/SSL/パスワード等の実エラーを可視化
    return NextResponse.json(
      { ok: false, error: err?.message ?? String(err) },
      { status: 500 },
    );
  } finally {
    // Lambda/Edgeのライフサイクル都合で明示的切断はしない
    // await prisma.$disconnect().catch(() => {});
  }
}
