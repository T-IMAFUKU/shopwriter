// app/api/shares/[id]/route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

export const runtime = "nodejs"; // Prisma を Node 実行に固定（Edge差異を排除）

// PrismaClient の単一インスタンス化
const g = globalThis as unknown as { __prisma?: PrismaClient };
const prisma = g.__prisma ?? (g.__prisma = new PrismaClient());

// JSON 正規化（Date などを安全に返す）
function normalize<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// エラー統一（500 を返さない）
function errorJson(
  status: 400 | 401 | 403 | 404,
  code: "bad_request" | "unauthorized" | "forbidden" | "not_found",
) {
  return NextResponse.json(normalize({ ok: false, error: code }), { status });
}

// 成功統一
function okJson(data: unknown) {
  return NextResponse.json(normalize({ ok: true, data }), { status: 200 });
}

function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}

function getDevActorId(req: Request): string | null {
  const v = req.headers.get("x-user-id") ?? req.headers.get("X-User-Id");
  const id = String(v ?? "").trim();
  return id ? id : null;
}

function readIsPublic(share: Record<string, unknown>): boolean | undefined {
  if (typeof share["isPublic"] === "boolean") return share["isPublic"] as boolean;
  if (typeof share["published"] === "boolean") return share["published"] as boolean;
  return undefined;
}

function readOwnerId(share: Record<string, unknown>): string | undefined {
  if (typeof share["ownerId"] === "string") return share["ownerId"] as string;
  if (typeof share["userId"] === "string") return share["userId"] as string;
  return undefined;
}

// GET /api/shares/[id]
// - 公開: 誰でも 200
// - 非公開: owner のみ 200（dev は X-User-Id 必須 / prod は unauthorized 扱い）
export async function GET(req: Request, ctx: { params: { id: string } }) {
  try {
    const id = String(ctx?.params?.id ?? "").trim();
    if (!id) return errorJson(400, "bad_request");

    const share = await prisma.share.findUnique({ where: { id } });
    if (!share) return errorJson(404, "not_found");

    const s = share as unknown as Record<string, unknown>;
    const isPublic = readIsPublic(s);

    // 公開なら常にOK（公開ページ/API用途）
    if (isPublic === true || isPublic === undefined) {
      // isPublic が無いスキーマでも公開扱いにしたい場合は undefined を許容
      // ※ ただし現状は isPublic が存在している前提なので、undefined は実質発生しない想定
      return okJson(share);
    }

    // 非公開 → owner だけ
    const ownerId = readOwnerId(s);
    if (!ownerId) return errorJson(403, "forbidden");

    if (isDev()) {
      const actorId = getDevActorId(req);
      if (!actorId) return errorJson(400, "bad_request");
      if (actorId !== ownerId) return errorJson(403, "forbidden");
      return okJson(share);
    }

    // production: ここは「未ログイン=unauthorized」扱い（管理画面用途）
    // ※ 本番は NextAuth を使って owner 判定する実装に寄せるのが理想だが、
    //    まずは問い合わせ耐性（403/401を返して壊れない）を優先する。
    return errorJson(401, "unauthorized");
  } catch {
    return errorJson(400, "bad_request");
  }
}

// PATCH /api/shares/[id]
// - dev: X-User-Id が owner と一致する場合のみ更新OK
export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  try {
    const id = String(ctx?.params?.id ?? "").trim();
    if (!id) return errorJson(400, "bad_request");

    // body
    let nextIsPublic: boolean | null = null;
    try {
      const j = (await req.json()) as any;
      if (typeof j?.isPublic === "boolean") nextIsPublic = j.isPublic;
    } catch {
      // noop
    }
    if (nextIsPublic === null) return errorJson(400, "bad_request");

    const share = await prisma.share.findUnique({ where: { id } });
    if (!share) return errorJson(404, "not_found");

    const s = share as unknown as Record<string, unknown>;
    const ownerId = readOwnerId(s);
    if (!ownerId) return errorJson(403, "forbidden");

    if (isDev()) {
      const actorId = getDevActorId(req);
      if (!actorId) return errorJson(400, "bad_request");
      if (actorId !== ownerId) return errorJson(403, "forbidden");

      const updated = await prisma.share.update({
        where: { id },
        data: { isPublic: nextIsPublic },
      });
      return okJson(updated);
    }

    return errorJson(401, "unauthorized");
  } catch {
    return errorJson(400, "bad_request");
  }
}
