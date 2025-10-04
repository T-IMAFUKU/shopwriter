import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../src/lib/prisma";
import {
  VER_LABEL_TEMPLATES,
  TemplateCreateRequestSchema,
  TemplateListResponseSchema,
} from "../../../src/contracts/templates";
const auth = async () => ({} as any); // TODO: put your real auth() helper path

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, init?: number | ResponseInit) {
  return typeof init === "number"
    ? NextResponse.json(data, { status: init })
    : NextResponse.json(data, init);
}
const toIso = (d: Date) => d.toISOString();

// GET /api/templates（ログインユーザーの一覧）
export async function GET() {
  const session = await auth();
  const uid = (session as any)?.user?.id as string | undefined;
  if (!uid) {
    return json(
      { ok: false as const, ver: VER_LABEL_TEMPLATES, error: { kind: "unauthorized", message: "signin required" } },
      401
    );
  }

  try {
    const rows = await prisma.template.findMany({
      where: { userId: uid }, // ← モデルが relation: user の場合は下のコメントへ切替
      // where: { user: { id: uid } }, // ← relation名が user の場合はこちら
      orderBy: { createdAt: "desc" },
    });

    const payload = {
      ok: true as const,
      ver: VER_LABEL_TEMPLATES,
      data: rows.map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body,
        createdAt: toIso(r.createdAt),
        updatedAt: toIso(r.updatedAt),
      })),
    };
    TemplateListResponseSchema.parse(payload);
    return json(payload, 200);
  } catch {
    return json(
      { ok: false as const, ver: VER_LABEL_TEMPLATES, error: { kind: "internal_error", message: "failed to list templates" } },
      500
    );
  }
}

// POST /api/templates（作成者=ログインユーザー）
export async function POST(req: NextRequest) {
  const session = await auth();
  const uid = (session as any)?.user?.id as string | undefined;
  if (!uid) {
    return json(
      { ok: false as const, ver: VER_LABEL_TEMPLATES, error: { kind: "unauthorized", message: "signin required" } },
      401
    );
  }

  try {
    const body = await req.json();
    const input = TemplateCreateRequestSchema.parse(body);

    const created = await prisma.template.create({
      data: {
        title: input.title,
        body: input.body,
        // --- Prisma モデルに合わせてどちらか1つだけ使う ---
        // A) 外部キー列が userId の場合（多くの構成はこちら）
        userId: uid,
        // B) relation フィールドが user の場合（Aを削除し、こちらを有効化）
        // user: { connect: { id: uid } },
      },
    });

    const payload = {
      ok: true as const,
      ver: VER_LABEL_TEMPLATES,
      data: [
        {
          id: created.id,
          title: created.title,
          body: created.body,
          createdAt: toIso(created.createdAt),
          updatedAt: toIso(created.updatedAt),
        },
      ],
    };
    TemplateListResponseSchema.parse(payload);
    return json(payload, 201);
  } catch (err: any) {
    if (err?.name === "ZodError") {
      return json(
        { ok: false as const, ver: VER_LABEL_TEMPLATES, error: { kind: "validation_error", message: "invalid request", issues: err.issues } },
        400
      );
    }
    return json(
      { ok: false as const, ver: VER_LABEL_TEMPLATES, error: { kind: "internal_error", message: "failed to create template" } },
      500
    );
  }
}
