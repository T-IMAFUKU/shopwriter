// app/api/products/route.ts
// Product 新規作成 API（最小）
// - POST /api/products
// - 有料のみ（ACTIVE/TRIALING）を許可（合意どおり）
// - 必須: name, category
// - 任意: slug, brand, description, factsNote
// - 成功: { ok: true, id: string }
// - 失敗: 400/401/403/409/500

import { NextResponse } from "next/server";
import { PrismaClient, SubscriptionStatus } from "@prisma/client";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export const runtime = "nodejs";

// PrismaClient の多重生成を避ける（dev hot-reload 対策）
declare global {
  // eslint-disable-next-line no-var
  var __shopwriter_prisma: PrismaClient | undefined;
}
const prisma = global.__shopwriter_prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") global.__shopwriter_prisma = prisma;

type CreateProductBody = {
  name?: unknown;
  category?: unknown;
  slug?: unknown;
  brand?: unknown;
  description?: unknown;
  factsNote?: unknown;
};

function asTrimmedString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
}

function optionalTrimmedString(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
}

async function requirePaidUser(): Promise<{ ok: true; userId: string } | { ok: false; res: Response }> {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    return {
      ok: false,
      res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionStatus: true },
  });

  // ユーザーがいないのは異常だが、ここでは 401 相当で落とす
  if (!u) {
    return {
      ok: false,
      res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const st = u.subscriptionStatus;

  // 合意: 有料のみ（TRIALING含む） => ACTIVE / TRIALING
  if (st === SubscriptionStatus.ACTIVE || st === SubscriptionStatus.TRIALING) {
    return { ok: true, userId };
  }

  return {
    ok: false,
    res: NextResponse.json(
      { error: "Payment required" },
      { status: 403 },
    ),
  };
}

export async function POST(req: Request): Promise<Response> {
  const gate = await requirePaidUser();
  if (!gate.ok) return gate.res;

  let body: CreateProductBody;
  try {
    body = (await req.json()) as CreateProductBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = asTrimmedString(body.name);
  const category = asTrimmedString(body.category);

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!category) {
    return NextResponse.json({ error: "category is required" }, { status: 400 });
  }

  const slug = optionalTrimmedString(body.slug);
  const brand = optionalTrimmedString(body.brand);
  const description = optionalTrimmedString(body.description);
  const factsNote = optionalTrimmedString(body.factsNote);

  try {
    const created = await prisma.product.create({
      data: {
        name,
        category,
        slug,
        brand,
        description,
        factsNote,
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true, id: created.id }, { status: 201 });
  } catch (e) {
    // slug unique 競合など（Prismaのエラーコードは環境差があるので、文字列で保険）
    const msg = e instanceof Error ? e.message : "Unknown error";

    if (msg.includes("Unique constraint") || msg.includes("P2002")) {
      return NextResponse.json(
        { error: "slug already exists" },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: "Failed to create product" },
      { status: 500 },
    );
  }
}
