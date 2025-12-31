/**
 * /api/shares — Prisma 接続版（契約準拠）
 * CP@2025-09-21.v3-compact tests-augmented に準拠
 *
 * 方針:
 * - 本番: NextAuth セッション必須（未認証は 401）
 * - 開発/テスト: X-User-Id ヘッダで擬似認証（無ければ 400）
 * - GET: list (cursor pagination)
 * - POST: create
 * - PATCH: update isPublic
 */

import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

type Json = Record<string, unknown>;
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" } as const;

function jsonify(data: Json, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function errorJson(
  code: "BAD_REQUEST" | "UNAUTHORIZED" | "UNPROCESSABLE_ENTITY" | "NOT_FOUND",
  message: string,
  status: number
): Response {
  return jsonify({ code, message }, status);
}

function isProd(): boolean {
  return process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
}

function getNextUrl(req: Request): URL {
  const anyReq = req as Request & { nextUrl?: URL };
  if (anyReq.nextUrl instanceof URL) return anyReq.nextUrl;
  return new URL(req.url);
}

function getDevUserId(req: Request): string | null {
  const h = req.headers.get("X-User-Id") || req.headers.get("x-user-id");
  return h && h.trim().length > 0 ? h.trim() : null;
}

async function requireAuth(req: Request): Promise<{ userId: string } | Response> {
  if (isProd()) {
    const session = await getServerSession(authOptions);
    const userId = (session as any)?.user?.id;
    if (typeof userId !== "string" || userId.trim().length === 0) {
      return errorJson("UNAUTHORIZED", "Authentication required.", 401);
    }
    return { userId };
  }

  const userId = getDevUserId(req);
  if (!userId) {
    return errorJson("BAD_REQUEST", "Missing X-User-Id header in development/test.", 400);
  }
  return { userId };
}

// --- GET --------------------------------------------------------------------
export async function GET(req: Request): Promise<Response> {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const url = getNextUrl(req);
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : 10;
  if (!Number.isFinite(limit) || limit < 1 || limit > 50) {
    return errorJson("BAD_REQUEST", "Query parameter 'limit' must be 1..50.", 400);
  }
  const cursor = url.searchParams.get("cursor") || undefined;

  const rows = await prisma.share.findMany({
    where: { ownerId: auth.userId },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
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

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1]?.id ?? null : null;

  return jsonify({ items, nextCursor }, 200);
}

// --- POST -------------------------------------------------------------------
export async function POST(req: Request): Promise<Response> {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {}

  const title =
    typeof (body as any)?.title === "string" ? ((body as any).title as string).trim() : "";
  if (!title) return errorJson("UNPROCESSABLE_ENTITY", "Field 'title' is required.", 422);

  const isPublic = typeof (body as any)?.isPublic === "boolean" ? (body as any).isPublic : false;
  const content = typeof (body as any)?.body === "string" ? ((body as any).body as string) : null;

  const created = await prisma.share.create({
    data: { title, body: content, isPublic, ownerId: auth.userId },
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

  return new Response(JSON.stringify(created), { status: 201, headers: JSON_HEADERS });
}

// --- PATCH ------------------------------------------------------------------
export async function PATCH(req: Request): Promise<Response> {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {}

  const id = typeof (body as any)?.id === "string" ? ((body as any).id as string).trim() : "";
  if (!id) return errorJson("UNPROCESSABLE_ENTITY", "Field 'id' is required.", 422);

  const isPublic = (body as any)?.isPublic;
  if (typeof isPublic !== "boolean") {
    return errorJson("UNPROCESSABLE_ENTITY", "Field 'isPublic' must be boolean.", 422);
  }

  // ownerId で保護（他人の share を触れない）
  const exists = await prisma.share.findFirst({
    where: { id, ownerId: auth.userId },
    select: { id: true },
  });
  if (!exists) return errorJson("NOT_FOUND", "Share not found.", 404);

  const updated = await prisma.share.update({
    where: { id },
    data: { isPublic },
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

  return jsonify(updated as unknown as Json, 200);
}
