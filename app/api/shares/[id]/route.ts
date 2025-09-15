// app/api/shares/[id]/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/shares/[id]
 * 仕様：
 *  - 未ログインでもアクセス可（公開ビュー）
 *  - 存在しない: 404
 *  - 非公開 or 期限切れ: 403（ただし所有者がログイン中なら 200）
 *  - 公開中: 200
 *  - 返却: share の最小限の安全な JSON
 */
export async function GET(
  _req: Request,
  { params }: { params: { id?: string } }
) {
  // id検証
  const id = params?.id?.trim();
  if (!id) {
    return NextResponse.json({ error: "Bad Request: id required" }, { status: 400 });
  }

  // レコード取得
  const share = await prisma.share.findUnique({
    where: { id },
  });

  if (!share) {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }

  // ログイン中なら所有者判定（所有者は非公開でも閲覧可）
  const session = await getServerSession(authOptions).catch(() => null);
  const ownerId = (session?.user as any)?.id as string | undefined;
  const isOwner = !!ownerId && share.userId === ownerId;

  // 公開状態判定（isPublic/expiresAt が無いスキーマでも動くようフォールバック）
  const now = new Date();
  const hasIsPublic = Object.prototype.hasOwnProperty.call(share, "isPublic");
  const isPublic = hasIsPublic ? (share as any).isPublic === true : true;

  const hasExpires = Object.prototype.hasOwnProperty.call(share, "expiresAt");
  const expiresAt = hasExpires ? (share as any).expiresAt as Date | null : null;
  const isExpired = !!expiresAt && new Date(expiresAt) < now;

  // 非公開 or 期限切れ → オーナー以外は 403
  if ((!isPublic || isExpired) && !isOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 返却ペイロード（必要最小限）
  const payload = {
    id: share.id,
    userId: share.userId,
    title: (share as any).title ?? null,
    content: (share as any).content ?? null,
    createdAt: (share as any).createdAt ?? null,
    updatedAt: (share as any).updatedAt ?? null,
    expiresAt: expiresAt ?? null,
    isPublic, // 判定後の論理値
  };

  return NextResponse.json(payload, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
