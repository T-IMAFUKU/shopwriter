// app/api/products/[id]/route.ts
// L2-11-2: Writer prefill 用（最小 + purpose/value 追加）
// - GET /api/products/:id で product.name を返す（ClientPage.tsx が参照）
// - 追加：purpose/value（ProductAttribute key="purpose"/"value"）を返す
// - 未登録時は null を返す（空文字にしない）
// - 失敗時は 404 を返す（ClientPage 側は現状維持）
//
// 注意：Writer UIは増やさない。prefill用データを静かに返すだけ。

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
    return NextResponse.json({ error: "Missing product id" }, { status: 400 });
  }

  const row = await prisma.product.findUnique({
    where: { id },
    select: { id: true, name: true, updatedAt: true },
  });

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // purpose/value を ProductAttribute から取得（未登録は null）
  // ※ モデル/カラム名が異なる場合は、TypeScriptエラー本文ベースで調整する（推測修正しない）
  let purpose: string | null = null;
  let value: string | null = null;

  try {
    const attrs = await prisma.productAttribute.findMany({
      where: {
        productId: id,
        key: { in: ["purpose", "value"] },
      },
      select: { key: true, value: true },
    });

    for (const a of attrs) {
      if (a.key === "purpose") purpose = a.value ?? null;
      if (a.key === "value") value = a.value ?? null;
    }
  } catch {
    // ここでAPIを落とさない（prefillは補助情報）
    // purpose/value は null のまま返す
  }

  return NextResponse.json(
    {
      id: row.id,
      name: row.name,
      updatedAt: row.updatedAt,
      purpose,
      value,
    },
    { status: 200 },
  );
}
