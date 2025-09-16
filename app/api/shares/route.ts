// app/api/shares/route.ts
// 開発時のみ X-Dev-Auth で認可をバイパス。ヘッダ/ENV一致なら 200 を返す確定版。
// 重要: Dynamic/No-Store を明示して、ビルド時評価やキャッシュ起因の 401 を防止。

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const runtime = 'nodejs';            // PrismaはNode実行が安定
export const dynamic = 'force-dynamic';     // リクエスト毎に評価（ヘッダを見る）
export const revalidate = 0;                // キャッシュ無効
export const fetchCache = 'force-no-store'; // 念のため

const prisma = new PrismaClient();

function parseLimit(url: URL) {
  const raw = url.searchParams.get('limit');
  const n = raw ? Number(raw) : 10;
  if (!Number.isFinite(n) || n <= 0) return 10;
  return Math.min(Math.floor(n), 100);
}

function isDevBypassAllowed(req: Request) {
  const token = process.env.SHARE_DEV_BYPASS_TOKEN ?? '';
  const header = req.headers.get('x-dev-auth') ?? '';
  return process.env.NODE_ENV !== 'production' && token !== '' && header === token;
}

// 最終防衛：空タイトルは「（無題）」に
function sanitizeTitle(title: string | null | undefined) {
  const t = (title ?? '').trim();
  return t.length === 0 ? '（無題）' : t;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = parseLimit(url);

  // 開発バイパス（本番無効）
  if (!isDevBypassAllowed(req)) {
    // 本番や未ログインは 401（既存仕様を踏襲）
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const rows = await prisma.share.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const items = rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      title: sanitizeTitle(r.title),
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
    }));

    return NextResponse.json({ ok: true, count: items.length, items }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Unexpected Error' }, { status: 500 });
  }
}
