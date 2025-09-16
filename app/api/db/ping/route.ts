// app/api/db/ping/route.ts（全文）
export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function maskUrl(raw?: string | null) {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    u.password = "***";
    return u.toString();
  } catch {
    return "***";
  }
}

export async function GET() {
  // DB 1 クエリで生存確認
  const now = await prisma.$queryRawUnsafe<Date>("select now()");
  return NextResponse.json({
    ok: true,
    now,
    databaseUrl: maskUrl(process.env.DATABASE_URL),
  });
}
