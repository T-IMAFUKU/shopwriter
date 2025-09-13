// app/api/shares/route.ts
// ShopWriter — 共有API: 作成/取得/無効化
// - POST /api/shares    : 共有を作成/更新（draftId必須）
// - GET  /api/shares    : 共有の取得（?slug=... または ?draftId=...）
// - DELETE /api/shares  : 共有の無効化（削除）
//
// 前提：prisma/schema.prisma に Share / ShareVisibility が存在
// 前提：NextAuth が /api/auth/[...nextauth] で稼働し、authOptions を export している

import { PrismaClient, ShareVisibility } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route"; // プロジェクトに合わせてパス調整

// --- Prisma Client (hot-reload 対策でglobalに保持) ---
const prisma = (globalThis as any).prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") (globalThis as any).prisma = prisma;

// --- Utils ---
function makeSlug(len = 10) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function now() {
  return new Date();
}

// --- Schemas ---
const PostBody = z.object({
  draftId: z.string().min(1),
  visibility: z.nativeEnum(ShareVisibility).optional(),
  slug: z
    .string()
    .regex(/^[a-z0-9-]{6,32}$/i, "slugは6〜32文字の英数・ハイフンのみ")
    .optional(),
  expiresAt: z.string().datetime().optional(), // ISO
  // 未来対応: password 受け取りは未実装（ハッシュ保存前提のため）
  password: z.never().optional(),
});

const DeleteBody = z.object({
  draftId: z.string().min(1).optional(),
  shareId: z.string().min(1).optional(),
});

// --- Access checks for GET (公開側) ---
function isAccessible(
  share: {
    visibility: ShareVisibility;
    expiresAt: Date | null;
  },
  isAuthenticated: boolean
) {
  if (share.expiresAt && share.expiresAt < now()) return false;

  switch (share.visibility) {
    case "PUBLIC":
    case "UNLISTED":
      return true;
    case "AUTHENTICATED":
      return isAuthenticated;
    case "PRIVATE":
    default:
      return false;
  }
}

// --- POST: 作成/更新 ---
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const json = await req.json();
    const body = PostBody.safeParse(json);
    if (!body.success) {
      return NextResponse.json({ error: "Bad Request", details: body.error.flatten() }, { status: 400 });
    }

    const { draftId, slug, visibility = "UNLISTED", expiresAt } = body.data;

    // Draft 存在確認
    const draft = await prisma.draft.findUnique({ where: { id: draftId } });
    if (!draft) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    // slug 決定（未指定なら自動生成・一意化）
    let finalSlug = slug ?? makeSlug(10);
    // 同一slugの存在確認（衝突回避）
    for (let i = 0; i < 5; i++) {
      const hit = await prisma.share.findUnique({ where: { slug: finalSlug } });
      if (!hit) break;
      finalSlug = makeSlug(10);
    }

    const createdBy = (session.user?.email ?? session.user?.id ?? "system") as string;

    // 既存 Share があれば更新、なければ作成（draftIdは1:1ユニーク）
    const share = await prisma.share.upsert({
      where: { draftId },
      update: {
        slug: finalSlug,
        visibility,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        createdBy,
      },
      create: {
        draftId,
        slug: finalSlug,
        visibility,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        createdBy,
        // publicId は schema 側で @default(cuid())
      },
      include: { draft: true },
    });

    return NextResponse.json(
      {
        ok: true,
        share: {
          id: share.id,
          draftId: share.draftId,
          slug: share.slug,
          publicId: share.publicId,
          visibility: share.visibility,
          expiresAt: share.expiresAt,
          createdAt: share.createdAt,
          updatedAt: share.updatedAt,
        },
      },
      { status: 201 }
    );
  } catch (e: any) {
    console.error("POST /api/shares error", e);
    // 一意制約など
    return NextResponse.json({ error: "Server Error", message: String(e?.message ?? e) }, { status: 500 });
  }
}

// --- GET: 取得（閲覧用） ---
// 使い方：/api/shares?slug=xxxxx  もしくは /api/shares?draftId=xxxxx
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get("slug") ?? undefined;
    const draftId = searchParams.get("draftId") ?? undefined;

    if (!slug && !draftId) {
      return NextResponse.json({ error: "Missing query: slug or draftId" }, { status: 400 });
    }

    const share = await prisma.share.findFirst({
      where: slug ? { slug } : { draftId },
      include: { draft: true },
    });

    if (!share) {
      return NextResponse.json({ error: "Not Found" }, { status: 404 });
    }

    const authed = !!session;
    if (!isAccessible(share, authed)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 公開レスポンス（ドラフト本文を含める）
    return NextResponse.json({
      ok: true,
      share: {
        id: share.id,
        draftId: share.draftId,
        slug: share.slug,
        publicId: share.publicId,
        visibility: share.visibility,
        expiresAt: share.expiresAt,
        createdAt: share.createdAt,
        updatedAt: share.updatedAt,
      },
      draft: {
        id: share.draft.id,
        title: share.draft.title,
        content: share.draft.content,
        createdAt: share.draft.createdAt,
      },
    });
  } catch (e: any) {
    console.error("GET /api/shares error", e);
    return NextResponse.json({ error: "Server Error", message: String(e?.message ?? e) }, { status: 500 });
  }
}

// --- DELETE: 無効化（共有削除） ---
// 使い方：JSON { draftId } or { shareId }
export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const json = await req.json();
    const parsed = DeleteBody.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Bad Request", details: parsed.error.flatten() }, { status: 400 });
    }
    const { draftId, shareId } = parsed.data;

    const target = await prisma.share.findFirst({
      where: shareId ? { id: shareId } : { draftId: draftId! },
    });

    if (!target) {
      return NextResponse.json({ error: "Not Found" }, { status: 404 });
    }

    await prisma.share.delete({ where: { id: target.id } });

    return NextResponse.json({ ok: true, deletedId: target.id });
  } catch (e: any) {
    console.error("DELETE /api/shares error", e);
    return NextResponse.json({ error: "Server Error", message: String(e?.message ?? e) }, { status: 500 });
  }
}
