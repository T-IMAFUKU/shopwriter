/**
 * Writer API - Request ベース + logEvent 直接呼び出し
 * - APIファイルは「async関数のみexport」ルールに準拠
 */

import { logEvent } from "@/lib/eventlog";

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json().catch(() => null);

    // ▼ 計測ログ（fire-and-forget）
    void logEvent(
      {
        event: "writer.post",
        category: "api",
        url: "/api/writer",
        payload: body ?? undefined,
        level: "INFO",
      },
      { fireAndForget: true }
    );

    return new Response(JSON.stringify({ ok: true, echo: body }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (_e) {
    // ▼ エラーログ（best-effort）
    void logEvent(
      {
        event: "writer.post.error",
        category: "api",
        level: "ERROR",
      },
      { fireAndForget: true }
    );

    return new Response(JSON.stringify({ ok: false, error: "internal_error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
