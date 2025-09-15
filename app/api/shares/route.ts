// app/api/shares/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/shares
 * - 認証必須：未ログインは 401
 * - ログインユーザーの userId で絞り込み
 * - ページネーション：?limit=10&before=ISO8601
 *   * before: createdAt より「過去（古い）」を取得するための境界
 *   * nextBefore: 次ページ要求に使う ISO8601（最後の要素の createdAt）
 */
export async function GET(req: Request) {
  // 認証確認
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // クエリ取得
  const { searchParams } = new URL(req.url);
  const limitParam = searchParams.get("limit");
  const beforeParam = searchParams.get("before");

  // limit 正規化（1〜100）
  let limit = Number.parseInt(limitParam ?? "20", 10);
  if (Number.isNaN(limit)) limit = 20;
  limit = Math.min(Math.max(limit, 1), 100);

  // where 句（ユーザー絞り込み + before があれば createdAt lt）
  const where: any = { userId };
  if (beforeParam) {
    const beforeDate = new Date(beforeParam);
    if (!Number.isNaN(beforeDate.getTime())) {
      where.createdAt = { lt: beforeDate };
    }
  }

  // 1件先読み（hasNext 判定 & nextBefore 算出）
  const rows = await prisma.share.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
  });

  const hasNext = rows.length > limit;
  const items = rows.slice(0, limit);

  const nextBefore =
    hasNext && items.length > 0
      ? items[items.length - 1]!.createdAt.toISOString()
      : null;

  // 返却（従来のページネーション形式を維持：items / nextBefore）
  return NextResponse.json({
    items,
    nextBefore,
  });
}
