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

// エラー統一：必ず 4xx を返し、500 経路を物理的に遮断
function errorJson(
  status: 400 | 403 | 404,
  code: "bad_request" | "forbidden" | "not_found"
) {
  return NextResponse.json(normalize({ ok: false, error: code }), { status });
}

// 成功統一
function okJson(data: unknown) {
  return NextResponse.json(normalize({ ok: true, data }), { status: 200 });
}

// GET /api/shares/[id] — 例外を外へ投げない（= 500 を返さない）
export async function GET(_req: Request, ctx: { params: { id: string } }) {
  try {
    const id = String(ctx?.params?.id ?? "").trim();

    // OrThrow は使わず、安全に存在確認
    const share = await prisma.share.findUnique({
      where: { id },
      // 返却を最小化（型の有無に依存しないため any で運ぶ）
      // 必要なら他フィールドも追加可
    });

    // 未存在 → 404
    if (!share) return errorJson(404, "not_found");

    // 非公開 → 403
    // スキーマの公開フラグ名が異なる可能性に備え、any 経由で安全に確認
    const s = share as Record<string, unknown>;
    const isPublic =
      typeof s["isPublic"] === "boolean"
        ? (s["isPublic"] as boolean)
        : // 他の名前で管理している場合はここに追加（例: published / public / visibility）
          typeof s["published"] === "boolean"
          ? (s["published"] as boolean)
          : undefined;

    if (isPublic === false) return errorJson(403, "forbidden");

    // 公開扱い → 200（フィールド名が未定義の場合でも 200 とする。公開判定は上でのみ弾く）
    return okJson(share);
  } catch {
    // 想定外を 400 に正規化（= 500ゼロ方針）
    return errorJson(400, "bad_request");
  }
}
