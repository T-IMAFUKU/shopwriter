// app/api/templates/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import type { Template } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store, max-age=0, must-revalidate" } as const;

function ver(label = "templates:id") {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000)
    .toISOString()
    .replace("T", " ")
    .replace("Z", "JST");
  return `B2r2-${label}-${jst}`;
}

function devHeaderAllowed() {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_DEV_HEADER === "1";
}

function resolveUserId(req: Request): string | undefined {
  if (devHeaderAllowed()) {
    const hdr = req.headers.get("x-user-id") ?? req.headers.get("X-User-Id");
    if (hdr && hdr.trim().length > 0) return hdr.trim();
  }
  return undefined;
}

function toErrorJson(err: unknown) {
  const base = {
    name: (err as any)?.name ?? "Error",
    message: (err as any)?.message ?? String(err),
  };
  const isProd = process.env.NODE_ENV === "production";

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return { ...base, kind: "PrismaClientKnownRequestError", code: err.code, meta: err.meta };
  }
  if (err instanceof Prisma.PrismaClientValidationError) {
    return {
      ...base,
      kind: "PrismaClientValidationError",
      ...(isProd ? {} : { stack: String((err as any)?.stack ?? "") }),
    };
  }
  if (err instanceof Prisma.PrismaClientInitializationError) {
    return { ...base, kind: "PrismaClientInitializationError", errorCode: err.errorCode };
  }
  if (err instanceof Prisma.PrismaClientRustPanicError) {
    return { ...base, kind: "PrismaClientRustPanicError" };
  }
  return { ...base, kind: "UnknownError", ...(isProd ? {} : { stack: String((err as any)?.stack ?? "") }) };
}

async function assertOwned(id: string, userId: string) {
  const tpl = await prisma.template.findUnique({
    where: { id },
    select: { id: true, userId: true },
  });
  if (!tpl) return { ok: false as const, status: 404 as const, kind: "not_found" as const };
  if (tpl.userId !== userId) return { ok: false as const, status: 403 as const, kind: "forbidden" as const };
  return { ok: true as const };
}

const IdSchema = z.string().min(1, "id is required");
const TemplatePatchSchema = z.object({
  title: z.string().min(1).max(120),
}).strict();

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const userId = resolveUserId(req);
    if (!userId) {
      return new NextResponse(JSON.stringify({
        ok: false,
        ver: ver(),
        error: { kind: "Unauthorized", name: "ApiError", message: "login required" },
      }), { status: 401, headers: noStore });
    }

    const idParse = IdSchema.safeParse(ctx.params?.id);
    if (!idParse.success) {
      return new NextResponse(JSON.stringify({
        ok: false,
        ver: ver(),
        error: { kind: "BadRequest", name: "ApiError", message: idParse.error.errors[0]?.message ?? "bad request" },
      }), { status: 400, headers: noStore });
    }

    const json = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const bodyParse = TemplatePatchSchema.safeParse(json);
    if (!bodyParse.success) {
      return new NextResponse(JSON.stringify({
        ok: false,
        ver: ver(),
        error: { kind: "BadRequest", name: "ApiError", message: "invalid payload", meta: bodyParse.error.flatten() },
      }), { status: 400, headers: noStore });
    }

    const guard = await assertOwned(idParse.data, userId);
    if (!guard.ok) {
      const status = guard.status;
      const kind = status === 404 ? "NotFound" : "Forbidden";
      const message = status === 404 ? "template not found" : "you do not own this template";
      return new NextResponse(JSON.stringify({ ok: false, ver: ver(), error: { kind, name: "ApiError", message } }), {
        status,
        headers: noStore,
      });
    }

    const data = { title: bodyParse.data.title } satisfies Prisma.TemplateUpdateInput;
    const updated = await prisma.template.update({
      where: { id: idParse.data },
      data,
      select: { id: true, title: true, updatedAt: true },
    });

    return new NextResponse(JSON.stringify({ ok: true, ver: ver(), data: updated }), {
      status: 200,
      headers: noStore,
    });
  } catch (err) {
    const error = toErrorJson(err);
    return new NextResponse(JSON.stringify({ ok: false, ver: ver(), error }), {
      status: 500,
      headers: noStore,
    });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const userId = resolveUserId(req);
    if (!userId) {
      return new NextResponse(JSON.stringify({
        ok: false,
        ver: ver(),
        error: { kind: "Unauthorized", name: "ApiError", message: "login required" },
      }), { status: 401, headers: noStore });
    }

    const idParse = IdSchema.safeParse(ctx.params?.id);
    if (!idParse.success) {
      return new NextResponse(JSON.stringify({
        ok: false,
        ver: ver(),
        error: { kind: "BadRequest", name: "ApiError", message: idParse.error.errors[0]?.message ?? "bad request" },
      }), { status: 400, headers: noStore });
    }

    const guard = await assertOwned(idParse.data, userId);
    if (!guard.ok) {
      const status = guard.status;
      const kind = status === 404 ? "NotFound" : "Forbidden";
      const message = status === 404 ? "template not found" : "you do not own this template";
      return new NextResponse(JSON.stringify({ ok: false, ver: ver(), error: { kind, name: "ApiError", message } }), {
        status,
        headers: noStore,
      });
    }

    await prisma.template.delete({ where: { id: idParse.data } });
    return new NextResponse(JSON.stringify({ ok: true, ver: ver(), data: { id: idParse.data } }), {
      status: 200,
      headers: noStore,
    });
  } catch (err) {
    const error = toErrorJson(err);
    return new NextResponse(JSON.stringify({ ok: false, ver: ver(), error }), {
      status: 500,
      headers: noStore,
    });
  }
}
