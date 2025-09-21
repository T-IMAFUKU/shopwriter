// app/api/db/ping/route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

// 驥崎ｦ・ API 繝ｫ繝ｼ繝医ｒ繝薙Ν繝画凾縺ｮ莠句燕繝ｬ繝ｳ繝繝ｪ繝ｳ繧ｰ蟇ｾ雎｡縺九ｉ螟悶☆
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  // CI 縺ｪ縺ｩ DATABASE_URL 縺檎┌縺・腸蠅・〒縺ｯ DB 繝√ぉ繝・け繧偵せ繧ｭ繝・・
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ ok: true, skipped: "no DATABASE_URL" });
  }

  const prisma = new PrismaClient();
  try {
    // 謗･邯夂｢ｺ隱搾ｼ亥ｮ牙・縺ｪ繧ｯ繧ｨ繝ｪ・・
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
