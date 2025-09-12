// app/api/drafts/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * userId は Draft モデルで必須。
 * - 基本: リクエストbodyで userId を受ける
 * - 代替: ヘッダ x-user-id
 * - 最終フォールバック: env DEFAULT_USER_ID または "system"
 *
 * ※ 後で NextAuth と連携する際は、ここを session.user.id に差し替えます。
 */
const DraftCreateSchema = z.object({
  title: z.string().min(1, "title is required"),
  body: z.string().optional(),
  content: z.string().optional(),
  userId: z.string().optional(),
}).refine(v => !!(v.body ?? v.content), {
  message: "Either body or content is required",
  path: ["content"],
});

export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/drafts" });
}

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const parsed = DraftCreateSchema.parse(json);

    // 本文は content に正規化
    const content = (parsed.body ?? parsed.content ?? "").trim();

    // userId を決定（body > header > env > "system"）
    const headerUserId = req.headers.get("x-user-id") ?? undefined;
    const userId =
      parsed.userId ??
      headerUserId ??
      process.env.DEFAULT_USER_ID ??
      "system";

    const draft = await prisma.draft.create({
      data: {
        userId,            // ★ 必須フィールド
        title: parsed.title,
        content,           // PrismaのDraftは content 列
      },
    });

    return NextResponse.json({ ok: true, draft }, { status: 201 });
  } catch (err) {
    const message =
      err instanceof z.ZodError ? err.flatten() : (err as Error).message;
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
