// 概要：Share 一覧/作成（DBとスキーマの乖離があっても落ちないミニマム）
// 方針：ownerId 準拠。body列は未使用（select/insertしない）。
// 応答：ok/false の正規JSON。例外は 4xx に正規化（500ゼロ方針）。
// 本番ポリシー：NODE_ENV=production では X-User-Id を無視し、未認証は必ず 401。
// 開発ポリシー：NODE_ENV!='production' かつ ALLOW_DEV_HEADER='1' の時のみ X-User-Id を暫定許可。

import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PrismaClient（単一インスタンス）
const g = globalThis as unknown as { __prisma?: PrismaClient };
const prisma = g.__prisma ?? (g.__prisma = new PrismaClient());

// 共通ユーティリティ
function j(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Content-Language", "ja");
  return new NextResponse(JSON.stringify(data), { ...init, headers });
}
function ok(data?: Record<string, unknown>, status: 200 | 201 = 200) {
  return j({ ok: true, ...(data ?? {}) }, { status });
}
function bad(
  message: string,
  status: 400 | 401 | 404 | 409 = 400,
  extra?: Record<string, unknown>
) {
  return j({ ok: false, message, ...(extra ?? {}) }, { status });
}

// 認証ヘルパ：本番は常に未認証。開発のみ ALLOW_DEV_HEADER=1 で X-User-Id を読む。
function getUserId(req: Request): string | null {
  const isProd = process.env.NODE_ENV === "production";
  const allowDevHeader = process.env.ALLOW_DEV_HEADER === "1";
  if (isProd || !allowDevHeader) {
    return null; // 本番またはフラグOFF → 未認証扱い
  }
  const v = req.headers.get("x-user-id") ?? req.headers.get("X-User-Id");
  return v && v.trim().length > 0 ? v.trim() : null;
}

// Zod（DBに確実にあるフィールドのみ）
const listQ = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  before: z.string().optional(), // ISO8601
});
const createBody = z.object({
  title: z.string().min(1, "title は必須です").max(200),
  isPublic: z.boolean().optional(),
});

// GET /api/shares
export async function GET(req: Request) {
  try {
    const userId = getUserId(req);
    if (!userId) return bad("未認証です", 401, { code: "NO_USER" });

    const { searchParams } = new URL(req.url);
    const parsed = listQ.safeParse({
      limit: searchParams.get("limit") ?? undefined,
      before: searchParams.get("before") ?? undefined,
    });
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join(", ");
      return bad("クエリが不正です: " + msg, 400, { code: "ZOD_PARSE_ERROR" });
    }

    const { limit, before } = parsed.data;
    let beforeDate: Date | undefined;
    if (before) {
      const d = new Date(before);
      if (Number.isNaN(d.getTime())) {
        return bad("before は ISO8601 日付文字列で指定してください", 400, { code: "INVALID_BEFORE" });
      }
      beforeDate = d;
    }

    const where: Record<string, unknown> = { ownerId: userId };
    if (beforeDate) (where as any).createdAt = { lt: beforeDate };

    // ★ body を select しない（列が無くても動く）
    const rows = await prisma.share.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
      select: {
        id: true,
        title: true,
        isPublic: true,
        ownerId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const items = rows.map((r) => ({
      id: r.id,
      title: r.title,
      isPublic: r.isPublic,
      ownerId: r.ownerId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    return ok({
      message: "共有一覧を取得しました",
      items,
      nextBefore: items.length > 0 ? items[items.length - 1].createdAt.toISOString() : null,
    });
  } catch (e: any) {
    console.error("[GET /api/shares] error", e);
    return bad("内部エラーが発生しました", 400, { code: e?.code ?? null, detail: e?.message ?? null });
  }
}

// POST /api/shares
export async function POST(req: Request) {
  try {
    const userId = getUserId(req);
    if (!userId) return bad("未認証です", 401, { code: "NO_USER" });

    const body = await req.json().catch(() => ({}));
    const parsed = createBody.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
      return bad(`入力が不正です: ${msg}`, 400, { code: "ZOD_PARSE_ERROR" });
    }

    const { title, isPublic } = parsed.data;

    // ★ body を書き込まない（列が無くても動く）
    const created = await prisma.share.create({
      data: {
        ownerId: userId,
        title,
        isPublic: isPublic ?? false,
      },
      select: {
        id: true,
        title: true,
        isPublic: true,
        ownerId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return ok({ message: "共有を作成しました", item: created }, 201);
  } catch (e: any) {
    console.error("[POST /api/shares] prisma error", e);
    const code = e?.code as string | undefined;
    if (code === "P2002") {
      return bad("一意制約により作成できませんでした", 409, { code, detail: e?.message ?? null });
    }
    return bad("作成に失敗しました", 400, { code, detail: e?.message ?? null });
  }
}
