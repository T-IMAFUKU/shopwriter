/**
 * Writer API - Request ベース + 最小ログ挿入
 * - 目的: EventLog へ「APIが呼ばれた」事実を記録する
 * - ログは best-effort（失敗しても本処理は止めない）
 */

import { EventLogger } from "@/src/lib/eventlog";

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json().catch(() => null);

    // ▼ 計測ログ（fire-and-forget）
    void EventLogger.info("writer.post", {
      category: "api",
      url: "/api/writer",
      payload: body ?? undefined,
    }, { fireAndForget: true });

    // 最小の成功レスポンス（後で本実装に差し替え）
    return new Response(JSON.stringify({ ok: true, echo: body }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (_e) {
    // ▼ エラーログ（best-effort）
    void EventLogger.error("writer.post.error", {
      category: "api",
    }, { fireAndForget: true });

    return new Response(JSON.stringify({ ok: false, error: "internal_error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
