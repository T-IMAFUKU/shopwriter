// app/api/shares/[id]/route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

export const runtime = "nodejs"; // Prisma安定動作用（Edge差異を排除）

// PrismaClient をローカルで安全に使い回し
const g = globalThis as unknown as { __prisma?: PrismaClient };
const prisma = g.__prisma ?? (g.__prisma = new PrismaClient());

// JSON 正規化（Date/undefined を安全に整形）
function normalize<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// エラーレスポンス（必ず 2xx/4xx を返す = 500 経路を物理封鎖）
function errorJson(
  status: 400 | 403 | 404,
  code: "bad_request" | "forbidden" | "not_found"
) {
  return NextResponse.json(normalize({ ok: false, error: code }), { status });
}

// 成功レスポンス
function okJson(data: unknown) {
  return NextResponse.json(normalize({ ok: true, data }), { status: 200 });
}

// GET /api/shares/[id] — 決して throw しない設計（= 500 を返さない）
export async function GET(_req: Request, ctx: { params: { id: string } }) {
  try {
    const id = String(ctx?.params?.id ?? "").trim();

    // OrThrow は使わない
    const share = await prisma.share.findUnique({
      where: { id },
      // 必要に応じて select で最小化
      // select: { id: true, title: true, isPublic: true, createdAt: true, updatedAt: true },
    });

    // 未存在 → 404
    if (!share) return errorJson(404, "not_found");

    // 非公開 → 403
    // モデルのフラグ名が異なる場合はこの1行だけ合わせてください
    // @ts-expect-error - 実プロジェクトの型定義に依存
    if (share.isPublic === false) return errorJson(403, "forbidden");

    // 公開 → 200
    return okJson(share);
  } catch {
    // 想定外も含めて 400 に正規化（= 500 を物理的に遮断）
    return errorJson(400, "bad_request");
  }
}
