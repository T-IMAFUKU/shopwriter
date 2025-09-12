// app/api/drafts/route.ts — 最小保存版（title/content/userId のみ）
// 認証は getServerSession、入力は body or content を許容、Prisma は必要最小限で保存

import { NextResponse } from "next/server";
import { headers, cookies } from "next/headers";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { getServerSession } from "next-auth/next";

const g = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = g.prisma ?? new PrismaClient({ log: ["warn", "error"] });
if (!g.prisma) g.prisma = prisma;

async function getSessionSafe() {
  try {
    const mod: any = await import("@/app/api/auth/[...nextauth]/route");
    if (mod?.authOptions) return await getServerSession(mod.authOptions);
  } catch {}
  return await getServerSession();
}

const DraftSchemaFlexible = z
  .object({
    title: z.string().min(1, "title is required"),
    body: z.string().min(1).optional(),
    content: z.string().min(1).optional(),
  })
  .refine((d) => Boolean(d.body ?? d.content), {
    message: "content (or body) is required",
    path: ["content"],
  });

export async function POST(req: Request) {
  try {
    const ua = headers().get("user-agent");
    const referer = headers().get("referer");
    const cookieNames = cookies().getAll().map((c) => c.name);
    console.debug("[/api/drafts][POST] UA=%s ref=%s cookies=%o", ua, referer, cookieNames);
  } catch {}

  const session: any = await getSessionSafe();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try { raw = await req.json(); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
  const parsed = DraftSchemaFlexible.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "ValidationError", detail: parsed.error.flatten() }, { status: 422 });
  }

  const input = parsed.data;
  const content = (input.content ?? input.body)!;

  try {
    const userId = (session.user as any)?.id ?? (session.user as any)?.email ?? "unknown";
    const created = await prisma.draft.create({
      data: {
        title: input.title,
        content,        // ← Prismaモデルにある想定のフィールドのみ
        userId: String(userId),
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e: any) {
    console.error("[/api/drafts][POST] prisma error:", e?.message || e);
    return NextResponse.json({ error: "ServerError" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const items = await prisma.draft.findMany({
      orderBy: [{ createdAt: "desc" }],
      take: 20,
    });
    return NextResponse.json({ items }, { status: 200 });
  } catch (e: any) {
    console.error("[/api/drafts][GET] prisma error:", e?.message || e);
    return NextResponse.json({ error: "ServerError" }, { status: 500 });
  }
}
