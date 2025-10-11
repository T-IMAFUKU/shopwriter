// 【CP@2025-09-21.v3】templates [id] API
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * X-User-Id（セッションの id / providerAccountId を想定）→ 内部 User.id を解決。
 * 未連携なら dev ではシャドーユーザーを自動作成（本番では401）。
 */
async function ensureDbUserId(req: NextRequest): Promise<string> {
  const raw = req.headers.get("x-user-id");
  const val = raw?.trim();
  if (!val) throw new Error("missing header: X-User-Id");

  // 1) 既に内部 User.id の可能性
  try {
    const u = await prisma.user.findUnique({ where: { id: val }, select: { id: true } });
    if (u?.id) return u.id;
  } catch {}

  // 2) Account.providerAccountId（例：GitHub ID）→ userId 解決
  try {
    const acc = await prisma.account.findFirst({
      where: { providerAccountId: val },
      select: { userId: true },
    });
    if (acc?.userId) return String(acc.userId);
  } catch {}

  // 3) devのみ自動連携
  if (process.env.NODE_ENV !== "production") {
    const created = await prisma.user.create({
      data: { id: val, name: `dev#${val}` },
      select: { id: true },
    });
    return created.id;
  }

  throw new Error("user not linked");
}

/** 正規化：空白trim＆最低限のバリデーション */
function normalizePayload(obj: any): { title: string; body: string } | null {
  if (!obj || typeof obj !== "object") return null;

  // よくある別名も受容して吸収（後方互換）
  const titleRaw = obj.title ?? obj.name ?? obj.subject ?? "";
  const bodyRaw = obj.body ?? obj.content ?? obj.text ?? "";

  const title = String(titleRaw).trim();
  const body = String(bodyRaw).trim();

  if (!title || !body) return null;
  return { title, body };
}

// -------- GET: 単一取得（任意）--------
export async function GET(
  _req: NextRequest,
  ctx: { params: { id: string } }
) {
  try {
    const id = String(ctx?.params?.id ?? "");
    if (!id) {
      return NextResponse.json(
        { ok: false, ver: "templates[id]", error: { kind: "bad_request", message: "id required" } },
        { status: 400 }
      );
    }

    const item = await prisma.template.findUnique({
      where: { id },
      select: { id: true, title: true, body: true, updatedAt: true, createdAt: true, userId: true },
    });

    if (!item) {
      return NextResponse.json(
        { ok: false, ver: "templates[id]", error: { kind: "not_found", message: "not found" } },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, item }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, ver: "templates[id]", error: { kind: "server", message: e?.message ?? "unknown error" } },
      { status: 500 }
    );
  }
}

// -------- PATCH: 更新（フロントは {title, body} を送信）--------
export async function PATCH(
  req: NextRequest,
  ctx: { params: { id: string } }
) {
  try {
    const userId = await ensureDbUserId(req);
    const id = String(ctx?.params?.id ?? "");
    if (!id) {
      return NextResponse.json(
        { ok: false, ver: "templates[id]", error: { kind: "bad_request", message: "id required" } },
        { status: 400 }
      );
    }

    const json = await req.json().catch(() => null);
    const payload = normalizePayload(json);
    if (!payload) {
      return NextResponse.json(
        { ok: false, ver: "templates[id]", error: { kind: "bad_request", message: "invalid payload" } },
        { status: 400 }
      );
    }

    // 所有確認（スキーマに userId がある前提。無い場合はこのチェックを外してください）
    const existing = await prisma.template.findUnique({ where: { id }, select: { userId: true } });
    if (!existing) {
      return NextResponse.json(
        { ok: false, ver: "templates[id]", error: { kind: "not_found", message: "not found" } },
        { status: 404 }
      );
    }
    if (existing.userId && existing.userId !== userId) {
      return NextResponse.json(
        { ok: false, ver: "templates[id]", error: { kind: "forbidden", message: "forbidden" } },
        { status: 403 }
      );
    }

    await prisma.template.update({
      where: { id },
      data: { title: payload.title, body: payload.body },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    if (msg.includes("missing header") || msg.includes("user not linked")) {
      return NextResponse.json(
        { ok: false, ver: "templates[id]", error: { kind: "unauthorized", message: "signin required (user not linked)" } },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { ok: false, ver: "templates[id]", error: { kind: "server", message: msg || "unknown error" } },
      { status: 500 }
    );
  }
}

// -------- DELETE: 削除（既にOKでも後方互換で保持）--------
export async function DELETE(
  req: NextRequest,
  ctx: { params: { id: string } }
) {
  try {
    const userId = await ensureDbUserId(req);
    const id = String(ctx?.params?.id ?? "");
    if (!id) {
      return NextResponse.json(
        { ok: false, ver: "templates[id]", error: { kind: "bad_request", message: "id required" } },
        { status: 400 }
      );
    }

    // 所有確認（必要に応じて）
    const existing = await prisma.template.findUnique({ where: { id }, select: { userId: true } });
    if (!existing) {
      return NextResponse.json(
        { ok: false, ver: "templates[id]", error: { kind: "not_found", message: "not found" } },
        { status: 404 }
      );
    }
    if (existing.userId && existing.userId !== userId) {
      return NextResponse.json(
        { ok: false, ver: "templates[id]", error: { kind: "forbidden", message: "forbidden" } },
        { status: 403 }
      );
    }

    await prisma.template.delete({ where: { id } });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    if (msg.includes("missing header") || msg.includes("user not linked")) {
      return NextResponse.json(
        { ok: false, ver: "templates[id]", error: { kind: "unauthorized", message: "signin required (user not linked)" } },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { ok: false, ver: "templates[id]", error: { kind: "server", message: msg || "unknown error" } },
      { status: 500 }
    );
  }
}
