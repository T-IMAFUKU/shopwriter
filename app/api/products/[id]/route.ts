// app/api/products/[id]/route.ts
// L2-11-2: Writer prefill 用（最小）
// - GET /api/products/:id で product.name を返す（ClientPage.tsx が参照）
// - 失敗時は 404 を返す（ClientPage 側は現状維持）
//
// 注意：ここでは「商品名のプリフィル」だけが目的なので、返す情報は最小（id/name/updatedAt）に限定する。

import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

export const runtime = "nodejs";

// PrismaClient の多重生成を避ける（dev hot-reload 対策）
declare global {
  // eslint-disable-next-line no-var
  var __shopwriter_prisma: PrismaClient | undefined;
}

const prisma = global.__shopwriter_prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") global.__shopwriter_prisma = prisma;

type Params = { id: string };

export async function GET(
  _req: Request,
  ctx: { params: Params },
): Promise<Response> {
  const id = ctx?.params?.id?.trim();
  if (!id) {
    return NextResponse.json(
      { error: "Missing product id" },
      { status: 400 },
    );
  }

  const row = await prisma.product.findUnique({
    where: { id },
    select: { id: true, name: true, updatedAt: true },
  });

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(
    {
      id: row.id,
      name: row.name,
      updatedAt: row.updatedAt,
    },
    { status: 200 },
  );
}
