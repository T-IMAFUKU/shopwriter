// app/api/templates/[id]/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth/next";
import { prisma } from "@/lib/prisma";

/** 認証ユーザーID（未ログイン/失敗は null） */
async function getAuthedUserId(): Promise<string | null> {
  try {
    // App Router では引数なしでも取得できる構成が一般的
    const session: any = await (getServerSession as any)();
    const uid = session?.user?.id ?? null;
    return typeof uid === "string" && uid.length > 0 ? uid : null;
  } catch {
    return null;
  }
}

/** OPTIONS: 許可メソッドを明示（Allow を必ず返す） */
export async function OPTIONS(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const headers = new Headers();
  headers.set("Allow", "GET, PATCH, DELETE, OPTIONS");
  return new NextResponse(null, { status: 204, headers });
}

/** GET /api/templates/[id]（閲覧） */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = params.id;
  try {
    const tpl = await prisma.template.findUnique({ where: { id } });
    if (!tpl) return NextResponse.json({ error: "Template not found" }, { status: 404 });
    return NextResponse.json({ item: tpl }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: "Internal Server Error", detail: String(err) }, { status: 500 });
  }
}

/** PATCH /api/templates/[id]（認証必須・所有者のみ更新） */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = params.id;
  const uid = await getAuthedUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const existing = await prisma.template.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!existing) return NextResponse.json({ error: "Template not found" }, { status: 404 });
    if (existing.userId !== uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Prismaに存在するフィールドのみ（例: title）
    const data: any = {};
    if (typeof body.title === "string") data.title = body.title;

    const updated = await prisma.template.update({ where: { id }, data });
    return NextResponse.json({ item: updated }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: "Internal Server Error", detail: String(err) }, { status: 500 });
  }
}

/** DELETE /api/templates/[id]（認証必須・所有者のみ削除） */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = params.id;
  const uid = await getAuthedUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const existing = await prisma.template.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!existing) return NextResponse.json({ error: "Template not found" }, { status: 404 });
    if (existing.userId !== uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const deleted = await prisma.template.delete({ where: { id } });
    return NextResponse.json({ item: deleted }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: "Internal Server Error", detail: String(err) }, { status: 500 });
  }
}
