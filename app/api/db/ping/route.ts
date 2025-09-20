// app/api/db/ping/route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

// 重要: API ルートをビルド時の事前レンダリング対象から外す
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  // CI など DATABASE_URL が無い環境では DB チェックをスキップ
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ ok: true, skipped: "no DATABASE_URL" });
  }

  const prisma = new PrismaClient();
  try {
    // 接続確認（安全なクエリ）
    await prisma.$queryRawUnsafe("SELECT 1");
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: String(err?.message ?? err) },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}
