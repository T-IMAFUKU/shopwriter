// app/api/shares/route.ts
// 概要：Share 一覧/作成（DBスキーマ ownerId に準拠）
// 方針：ヘッダ X-User-Id を受け取り、DBは ownerId に保存/検索
// 返却：ok/false を含む正規JSON。可能な限り 4xx を返し 500 を出さない。

import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

export const runtime = "nodejs";        // Prisma 安定動作用
export const dynamic = "force-dynamic"; // 一覧のキャッシュ無効化

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
function ok(data: unknown, status: 200 | 201 = 200) {
  return j({ ok: true, ...data }, { status });
}
function bad(message: string, status: 400 | 401 | 404 | 409 = 400, extra?: Record<string, unknown>) {
  return j({ ok: false, message, ...(extra ?? {}) }, { status });
}
function getUserId(req: Request): string | null {
  const v = req.headers.get("X-User-Id");
  return v && v.trim().length > 0 ? v.trim() : null;
}

// Zod（DBに存在する項目のみ）
// - Share スキーマ：id, title, body?, isPublic, ownerId?, createdAt, updatedAt
const listQ = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  before: z.string().optional(), // ISO8601 文字列→Date化
});

const createBody = z.object({
  title: z.string().min(1, "title は必須です").max(200),
  body: z.string().max(10_000).optional().nullable(),
  isPublic: z.boolean().optional(),
});

// GET /api/shares
export async function GET(req: Request) {
  try {
    const userId = getUserId(req);
    if (!userId) return bad("未認証です（X-User-Id ヘッダがありません）", 401, { code: "NO_USER" });

    const { searchParams } = new URL(req.url);
    const parsed = listQ.safeParse({
      limit: searchParams.get("limit") ?? undefined,
      before: searchParams.get("before") ?? undefined,
    });
    if (!parsed.success) {
      const msg = parsed.error.issues.map(i => i.message).join(", ");
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
    if (beforeDate) where.createdAt = { lt: beforeDate };

    // スキーマに存在する項目のみ select
    const rows = await prisma.share.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
      select: {
        id: true,
        title: true,
        body: true,
        isPublic: true,
        ownerId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const items = rows.map(r => ({
      id: r.id,
      title: r.title,
      isPublic: r.isPublic,
      ownerId: r.ownerId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      // 一覧では body を省略したい場合はコメントアウト可
      // body: r.body,
    }));

    return ok({
      message: "共有一覧を取得しました",
      items,
      nextBefore: items.length > 0 ? items[items.length - 1].createdAt.toISOString() : null,
    });
  } catch (e: any) {
    console.error("[GET /api/shares] error", e);
    // ここでは 400 に正規化（500 を避ける）
    return bad("内部エラーが発生しました", 400, { code: e?.code ?? null, detail: e?.message ?? null });
  }
}

// POST /api/shares
export async function POST(req: Request) {
  try {
    const userId = getUserId(req);
    if (!userId) return bad("未認証です（X-User-Id ヘッダがありません）", 401, { code: "NO_USER" });

    const body = await req.json().catch(() => ({}));
    const parsed = createBody.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join(", ");
      return bad(`入力が不正です: ${msg}`, 400, { code: "ZOD_PARSE_ERROR" });
    }

    const { title, body: content, isPublic } = parsed.data;

    const created = await prisma.share.create({
      data: {
        ownerId: userId,          // ← ここがポイント：DBは ownerId
        title,
        body: content ?? null,    // schema: body String? @db.Text
        isPublic: isPublic ?? false,
      },
      select: {
        id: true,
        title: true,
        body: true,
        isPublic: true,
        ownerId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return ok({ message: "共有を作成しました", item: created }, 201);
  } catch (e: any) {
    console.error("[POST /api/shares] prisma error", e);
    // P2002 等は 409/400 に落とす
    const code = e?.code as string | undefined;
    if (code === "P2002") {
      return bad("一意制約により作成できませんでした", 409, { code, detail: e?.message ?? null });
    }
    return bad("作成に失敗しました", 400, { code, detail: e?.message ?? null });
  }
}
