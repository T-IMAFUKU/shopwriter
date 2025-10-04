import { NextRequest } from "next/server";

/**
 * Writer API (minimal, type-safe stub)
 * - 型エクスポート: POST を提供して tests の import を満たす
 * - 実装は最小限（今は型エラー解消が目的）
 * - 後続ステップで本実装へ差し替え
 */
export const runtime = "nodejs"; // or "edge" にする場合は要検討

export async function POST(_req: NextRequest) {
  // ここでは型通過用のダミー応答を返す（後で本実装へ置換）
  return Response.json({ ok: true }, { status: 200 });
}
