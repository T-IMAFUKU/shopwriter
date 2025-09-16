// app/api/dev-auth/route.ts
import { NextResponse } from 'next/server';

// 明示的に Node 実行（Prisma 等と同様に安定）
export const runtime = 'nodejs';

/**
 * GET /api/dev-auth
 * 目的:
 *  - リクエストヘッダ X-Dev-Auth がサーバに届いているか
 *  - .env.local の SHARE_DEV_BYPASS_TOKEN をサーバが読めているか
 *  - 両者が一致しているか（equal=true なら PowerShell バイパス可能）
 *
 * 注意: 開発用の診断API。確認後は削除/無効化推奨。
 */
export async function GET(req: Request) {
  const header = req.headers.get('x-dev-auth') ?? null;
  const envVal = process.env.SHARE_DEV_BYPASS_TOKEN ?? null;
  const equal = header !== null && envVal !== null && header === envVal;

  return NextResponse.json({
    ok: true,
    now: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV ?? null,
    receivedHeader: header,
    env_SHARE_DEV_BYPASS_TOKEN: envVal,
    equal, // true ならヘッダ到達 & ENV一致
    notes: [
      'equal=true になれば PowerShell からのヘッダ到達 & .env.local 読み込みOK',
      'equal=false の場合: .env.local の値/再起動/エンコード(BOMなし)/送信ヘッダ値を確認',
    ],
    path: '/api/dev-auth',
  });
}
