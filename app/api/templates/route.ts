// app/api/templates/route.ts
// Runtime: Node.js 固定（Edgeでは実行しない）
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const prisma = new PrismaClient();

// --- Schemas ---------------------------------------------------------------
const TemplateCreateSchema = z.object({
  title: z.string().min(1, "title は必須です").max(255),
  body: z.string().min(1, "body は必須です"),
});

const TemplateListQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : 20))
    .pipe(z.number().int().min(1).max(100)),
});

// --- Helpers ---------------------------------------------------------------
function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}
function err(status: number, message: string, issues?: unknown) {
  return json({ ok: false, message, issues }, { status });
}

// --- Dev Auth（型安全・互換版）-------------------------------------------
// ・本番(VERCEL=1 && NODE_ENV=production)では常に null（=401）
// ・開発は ALLOW_DEV_HEADER=1 のときのみ以下を許可：
//    1) ヘッダ x-user-id / X-User-Id（大小どちらでも）
//    2) 予備: ?dev_user_id=... クエリ
function getDevUserId(req: Request): string | null {
  const isProd = process.env.VERCEL === "1" && process.env.NODE_ENV === "production";
  if (isProd) return null;

  if (process.env.ALLOW_DEV_HEADER !== "1") return null;

  // まずは通常の get（大小2通り）
  let fromHeader = req.headers.get("x-user-id") ?? req.headers.get("X-User-Id");

  // 一部の環境で型定義差異があるため、イテレータを any 扱いでフォールバック
  if (!fromHeader) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const pair of req.headers as any) {
        const [k, v] = pair as [unknown, unknown];
        if (typeof k === "string" && k.toLowerCase() === "x-user-id" && typeof v === "string") {
          fromHeader = v.trim();
          break;
        }
      }
    } catch {
      // 何もしない（フォールバック失敗時は null のまま）
    }
  }

  if (fromHeader && fromHeader.trim().length > 0) return fromHeader.trim();

  const url = new URL(req.url);
  const q = url.searchParams.get("dev_user_id");
  if (q && q.trim().length > 0) return q.trim();

  return null;
}

// --- GET /api/templates ----------------------------------------------------
// 一覧（ユーザー毎）: ?limit=20
export async function GET(req: Request) {
  const url = new URL(req.url);
  const qs = Object.fromEntries(url.searchParams.entries());
  const parsed = TemplateListQuerySchema.safeParse(qs);
  if (!parsed.success) {
    return err(400, "クエリが不正です", parsed.error.flatten());
  }

  const userId = getDevUserId(req);
  if (!userId) {
    return err(401, "未認証です（開発は ALLOW_DEV_HEADER=1 + X-User-Id か ?dev_user_id=）");
  }

  const items = await prisma.template.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: parsed.data.limit,
    select: { id: true, title: true, body: true, userId: true, createdAt: true, updatedAt: true },
  });

  return json({ ok: true, items });
}

// --- POST /api/templates ---------------------------------------------------
// 作成: { title, body }
export async function POST(req: Request) {
  const userId = getDevUserId(req);
  if (!userId) {
    return err(401, "未認証です（開発は ALLOW_DEV_HEADER=1 + X-User-Id か ?dev_user_id=）");
  }

  let jsonBody: unknown;
  try {
    jsonBody = await req.json();
  } catch {
    return err(400, "JSON ではありません");
  }

  const parsed = TemplateCreateSchema.safeParse(jsonBody);
  if (!parsed.success) {
    return err(400, "入力が不正です", parsed.error.flatten());
  }

  const { title, body } = parsed.data;

  const created = await prisma.template.create({
    data: { title, body, userId },
    select: { id: true, title: true, body: true, userId: true, createdAt: true, updatedAt: true },
  });

  return json({ ok: true, item: created }, { status: 201 });
}
