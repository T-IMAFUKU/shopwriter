// 【CP@2025-09-21.v3】templates API
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * X-User-Id（セッション側の id や providerAccountId を想定）から
 * 内部 User.id を解決する。未連携なら開発環境では自動連携（User作成）を行う。
 * 本番では自動連携しない。
 */
async function ensureDbUserId(req: NextRequest): Promise<string> {
  const raw = req.headers.get("x-user-id");
  const val = raw?.trim();
  if (!val) {
    throw new Error("missing header: X-User-Id");
  }

  // 1) すでに内部 User.id が来ている場合（そのまま存在確認）
  try {
    const u = await prisma.user.findUnique({ where: { id: val }, select: { id: true } });
    if (u?.id) return u.id;
  } catch {}

  // 2) Account.providerAccountId（例: GitHubのID）→ userId を解決
  try {
    const acc = await prisma.account.findFirst({
      where: { providerAccountId: val },
      select: { userId: true },
    });
    if (acc?.userId) return String(acc.userId);
  } catch {}

  // 3) 開発環境のみ：自動連携（シャドーユーザー作成）
  if (process.env.NODE_ENV !== "production") {
    // User.email は NextAuth標準スキーマだと Optional なので未設定で作成可
    const created = await prisma.user.create({
      data: {
        id: val,                  // そのまま内部IDとして採用（String型想定）
        name: `dev#${val}`,       // 表示用の暫定名
      },
      select: { id: true },
    });
    return created.id;
  }

  // 本番は自動連携しない
  throw new Error("user not linked");
}

// -------- GET: 一覧 --------
export async function GET(req: NextRequest) {
  try {
    const userId = await ensureDbUserId(req);

    // スキーマがユーザー非紐付けの場合は where を外してください
    const items = await prisma.template.findMany({
      where: { userId },
      select: { id: true, title: true, body: true, updatedAt: true, createdAt: true },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json(items, { status: 200 });
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    if (msg.includes("missing header") || msg.includes("user not linked")) {
      return NextResponse.json(
        { ok: false, ver: "templates", error: { kind: "unauthorized", message: "signin required (user not linked)" } },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { ok: false, ver: "templates", error: { kind: "server", message: msg || "unknown error" } },
      { status: 500 }
    );
  }
}

// -------- POST: 作成 --------
export async function POST(req: NextRequest) {
  try {
    const userId = await ensureDbUserId(req);

    const { title, body } = await req.json();
    if (!title || !body) {
      return NextResponse.json(
        { ok: false, ver: "templates", error: { kind: "bad_request", message: "title/body required" } },
        { status: 400 }
      );
    }

    const created = await prisma.template.create({
      data: { title: String(title), body: String(body), userId },
      select: { id: true },
    });

    return NextResponse.json({ ok: true, id: created.id }, { status: 201 });
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    if (msg.includes("missing header") || msg.includes("user not linked")) {
      return NextResponse.json(
        { ok: false, ver: "templates", error: { kind: "unauthorized", message: "signin required (user not linked)" } },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { ok: false, ver: "templates", error: { kind: "server", message: msg || "unknown error" } },
      { status: 500 }
    );
  }
}

// -------- PATCH: 更新（/api/templates に id, title, body を JSON で送る版）--------
export async function PATCH(req: NextRequest) {
  try {
    const userId = await ensureDbUserId(req);

    const { id, title, body } = await req.json();
    if (!id || !title || !body) {
      return NextResponse.json(
        { ok: false, ver: "templates", error: { kind: "bad_request", message: "id/title/body required" } },
        { status: 400 }
      );
    }

    await prisma.template.update({
      where: { id: String(id) },
      data: { title: String(title), body: String(body), userId },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    if (msg.includes("missing header") || msg.includes("user not linked")) {
      return NextResponse.json(
        { ok: false, ver: "templates", error: { kind: "unauthorized", message: "signin required (user not linked)" } },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { ok: false, ver: "templates", error: { kind: "server", message: msg || "unknown error" } },
      { status: 500 }
    );
  }
}

// -------- DELETE: クエリパラメータ id 版（/api/templates?id=...）--------
export async function DELETE(req: NextRequest) {
  try {
    const userId = await ensureDbUserId(req);
    void userId; // 監査用途。必要なら where に加えてください。

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { ok: false, ver: "templates", error: { kind: "bad_request", message: "id required" } },
        { status: 400 }
      );
    }

    await prisma.template.delete({ where: { id: String(id) } });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    if (msg.includes("missing header") || msg.includes("user not linked")) {
      return NextResponse.json(
        { ok: false, ver: "templates", error: { kind: "unauthorized", message: "signin required (user not linked)" } },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { ok: false, ver: "templates", error: { kind: "server", message: msg || "unknown error" } },
      { status: 500 }
    );
  }
}
