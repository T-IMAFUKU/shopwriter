/**
 * writerLogger.ts
 * - Better Stack(Logtail) 直送 or console の二段構え
 * - Edge/Node両対応: fetch を直接使用（SDK不使用）
 * - 本番は ENV で有効化:
 *   WRITER_LOG_ENABLED=true
 *   WRITER_LOG_MODE=direct        # console/direct
 *   LOGTAIL_ENDPOINT=https://in.logtail.com
 *   LOGTAIL_SOURCE_TOKEN=xxxxx
 */

export type WriterPhase = "request" | "success" | "failure";
export type WriterLevel = "INFO" | "WARN" | "ERROR";

export interface WriterLogInput {
  phase: WriterPhase;
  level?: WriterLevel; // 省略時は INFO
  route?: string;      // 例: "/api/writer"
  message?: string;
  requestId?: string;
  provider?: string;   // "openai" 等
  model?: string;
  durationMs?: number;
  meta?: Record<string, unknown>;
}

/** ENV 取得（undefinedは扱いやすいよう空文字にしない） */
const ENV = {
  ENABLED: process.env.WRITER_LOG_ENABLED,
  MODE: process.env.WRITER_LOG_MODE, // "console" | "direct"
  ENDPOINT: process.env.LOGTAIL_ENDPOINT ?? "https://in.logtail.com",
  TOKEN: process.env.LOGTAIL_SOURCE_TOKEN,
  NODE_ENV: process.env.NODE_ENV ?? "development",
};

function isEnabled(): boolean {
  return (ENV.ENABLED ?? "").toLowerCase() === "true";
}
function mode(): "console" | "direct" {
  return (ENV.MODE === "direct" ? "direct" : "console");
}

/** ログ本体（例外は飲み込み・アプリ処理は止めない） */
export async function writerLog(input: WriterLogInput): Promise<void> {
  try {
    const now = new Date().toISOString();
    const payload = {
      ts: now,
      phase: input.phase,
      level: input.level ?? defaultLevel(input.phase),
      route: input.route ?? "/api/writer",
      message: input.message ?? "",
      requestId: input.requestId,
      provider: input.provider,
      model: input.model,
      durationMs: input.durationMs,
      meta: input.meta ?? {},
      env: ENV.NODE_ENV,
      service: "writer",
    };

    // 無効 or トークンなし → console へフォールバック
    if (!isEnabled()) {
      // 開発時と同じ見え方を維持
      /* eslint-disable no-console */
      console.log("[writerLog:disabled]", payload);
      return;
    }

    if (mode() === "direct") {
      // 直送（Logtail Ingest API）
      if (!ENV.TOKEN) {
        console.warn("[writerLog] LOGTAIL_SOURCE_TOKEN is missing. Fallback to console.");
        console.log("[writerLog:console]", payload);
        return;
      }
      const res = await fetch(ENV.ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${ENV.TOKEN}`,
        },
        body: JSON.stringify(payload),
      });
      // 失敗時は握りつぶしてアプリ継続
      if (!res.ok) {
        console.warn("[writerLog] failed to send to Logtail:", res.status, await safeText(res));
      }
      return;
    }

    // console モード
    console.log("[writerLog:console]", payload);
  } catch (err) {
    console.warn("[writerLog] error:", err);
  }
}

function defaultLevel(p: WriterPhase): WriterLevel {
  if (p === "failure") return "ERROR";
  if (p === "success") return "INFO";
  return "INFO";
}

async function safeText(res: Response) {
  try { return await res.text(); } catch { return "<no-body>"; }
}
