// app/api/templates/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// NextAuth を安定させるため Node ランタイムで固定（Edge だと Cookie/Session 取得が不安定なケース対策）
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ★ 新ビルド反映の判定用（この文字がレスポンスに出れば新コード）
const API_VER = "B2v7-templates-2025-09-27T04:30JST";

// JWT 復号（未設定でも email フォールバックで動作継続）
const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET ?? undefined;

/**
 * 認証ユーザーIDの確定（確実化）
 * 優先: JWT.sub → session.user.email →（開発のみ）X-User-Id
 */
async function resolveUserId(req: NextRequest): Promise<string | null> {
  // 1) JWT（__Secure-next-auth.session-token / next-auth.session-token）
  if (NEXTAUTH_SECRET) {
    try {
      const token = await getToken({ req, secret: NEXTAUTH_SECRET });
      const sub = (token?.sub as string | undefined) ?? null;
      if (sub) return `gh:${sub}`;
    } catch (e) {
      console.warn("[templates] getToken failed:", e);
    }
  }

  // 2) NextAuth セッション（/api/auth/session で email が出ている事実に合わせる）
  const session = await getServerSession(authOptions);
  const email =
    (session?.user as { email?: string } | null | undefined)?.email ?? null;
  if (email) return `mail:${email.toLowerCase()}`;

  // 3) 本番はバイパス禁止
  if (process.env.NODE_ENV === "production") return null;

  // 4) 開発のみヘッダバイパス可（既存互換）
  if (process.env.ALLOW_DEV_HEADER === "1") {
    const id = req.headers.get("x-user-id");
    if (id && id.trim()) return id.trim();
  }

  return null;
}

// GET /api/templates?limit=50
export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserId(req);
    if (!userId) {
      return NextResponse.json(
        { ok: false, code: "UNAUTHORIZED", ver: API_VER },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") || "50", 10) || 50, 1),
      100
    );

    const items = await prisma.template.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json(
      { ok: true, ver: API_VER, items },
      { status: 200, headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (err) {
    console.error("[GET /api/templates] error:", err);
    return NextResponse.json(
      { ok: false, ver: API_VER, error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

// POST /api/templates
// 期待入力: { title?: string, body?: string } ※ Prismaで body が必須なら空文字で埋める
export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req);
    if (!userId) {
      return NextResponse.json(
        { ok: false, code: "UNAUTHORIZED", ver: API_VER },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    const payload = await req.json().catch(() => ({} as any));
    const title: string =
      typeof payload?.title === "string" && payload.title.trim()
        ? payload.title.trim()
        : "Untitled";
    const body: string = typeof payload?.body === "string" ? payload.body : "";

    const created = await prisma.template.create({
      data: { userId, title, body },
    });

    return NextResponse.json(
      { ok: true, ver: API_VER, item: created },
      { status: 200 }
    );
  } catch (err) {
    console.error("[POST /api/templates] error:", err);
    return NextResponse.json(
      { ok: false, ver: API_VER, error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
