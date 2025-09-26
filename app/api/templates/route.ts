// app/api/templates/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// 重要：Edge では Cookie/Session が不安定になり得るため Node で固定
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ★ この文字列がレスポンスに出たら「新ビルドが反映」しています
const API_VER = "B2v5-templates-2025-09-27T03:15JST";

// JWT 復号用（未設定でも email フォールバックで動作継続）
const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET ?? undefined;

/** 認証ユーザーIDの確定（確実化）
 * 優先: JWT.sub → session.user.email →（開発のみ）ヘッダバイパス
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
  // 2) NextAuth セッション（今回 /api/auth/session に email が出ている）
  const session = await getServerSession(authOptions);
  const email = (session?.user as { email?: string } | null | undefined)?.email ?? null;
  if (email) return `mail:${email.toLowerCase()}`;

  // 3) 本番はバイパス禁止
  if (process.env.NODE_ENV === "production") return null;

  // 4) 開発のみ簡易バイパス許可（既存運用互換）
  if (process.env.ALLOW_DEV_HEADER === "1") {
    const id = req.headers.get("x-user-id");
    if (id && id.trim()) return id.trim();
  }
  return null;
}

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
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50", 10) || 50, 1), 100);

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
    return NextResponse.json({ ok: false, ver: API_VER, error: "Internal Server Error" }, { status: 500 });
  }
}

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
    const title: string = typeof payload?.title === "string" && payload.title.trim() ? payload.title.trim() : "Untitled";
    // Prisma で必須なら空文字で埋める
    const body: string = typeof payload?.body === "string" ? payload.body : "";

    const created = await prisma.template.create({
      data: { userId, title, body },
    });

    return NextResponse.json({ ok: true, ver: API_VER, item: created }, { status: 200 });
  } catch (err) {
    console.error("[POST /api/templates] error:", err);
    return NextResponse.json({ ok: false, ver: API_VER, error: "Internal Server Error" }, { status: 500 });
  }
}
