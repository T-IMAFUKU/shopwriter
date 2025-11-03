/**
 * writerLogger.ts
 * - Better Stack(Logtail) 直送 or console の二段構え
 * - Edge/Node両対応: fetch を直接使用（SDK不使用）
 * - 本番は ENV で有効化:
 *   WRITER_LOG_ENABLED=true
 *   WRITER_LOG_MODE=direct        # console/direct
 *   LOGTAIL_ENDPOINT=https://in.logs.betterstack.com
 *   LOGTAIL_SOURCE_TOKEN=xxxxx
 */

export type WriterPhase = "request" | "success" | "failure";
export type WriterLevel = "INFO" | "WARN" | "ERROR";

export interface WriterLogInput {
  phase: WriterPhase;
  level?: WriterLevel; // 省略時は INFO
  route?: string;      // 例: "/api/writer"
  message?: string;    // 一覧の Message 欄に出す。未指定なら buildMessage() で自動生成
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
  // ✅ Better Stack の正式 Ingest URL を既定値に
  ENDPOINT: process.env.LOGTAIL_ENDPOINT ?? "https://in.logs.betterstack.com",
  TOKEN: process.env.LOGTAIL_SOURCE_TOKEN,
  NODE_ENV: process.env.NODE_ENV ?? "development",
};

function isEnabled(): boolean {
  return (ENV.ENABLED ?? "").toLowerCase() === "true";
}
function mode(): "console" | "direct" {
  return ENV.MODE === "direct" ? "direct" : "console";
}

/** Better Stack の一覧に出すための要約メッセージ（未指定時の自動生成） */
function buildMessage(input: WriterLogInput): string {
  const r = input.route ?? "/api/writer";
  const m = input.model ? ` model=${input.model}` : "";
  const p = input.provider ? ` provider=${input.provider}` : "";
  const id = input.requestId ? ` rid=${input.requestId}` : "";
  if (input.phase === "request") return `request ${r}${m}${p}${id}`;
  if (input.phase === "success") {
    const d = typeof input.durationMs === "number" ? ` ${input.durationMs}ms` : "";
    return `success ${r}${m}${p}${id}${d}`;
  }
  // failure
  const reason =
    typeof input.meta?.reason === "string"
      ? ` reason=${String(input.meta!.reason)}`
      : "";
  const d = typeof input.durationMs === "number" ? ` ${input.durationMs}ms` : "";
  return `failure ${r}${m}${p}${id}${reason}${d}`;
}

/** レスポンス本文を安全にテキスト化（失敗しても空文字で返す） */
async function safeText(res: Response) {
  try { return await res.text(); } catch { return ""; }
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
      // ✅ message 未指定でも一覧に出るよう自動要約
      message: (input.message ?? buildMessage(input)).slice(0, 512),
      requestId: input.requestId,
      provider: input.provider,
      model: input.model,
      durationMs: input.durationMs,
      meta: input.meta ?? {},
      env: ENV.NODE_ENV,
      service: "writer",
    };

    // 無効 → console 表示のみ（開発時と同じ見え方）
    if (!isEnabled()) {
      /* eslint-disable no-console */
      console.log("[writerLog:disabled]", payload);
      return;
    }

    // direct: Better Stack に直送
    if (mode() === "direct") {
      if (!ENV.TOKEN) {
        console.warn("[writerLog] LOGTAIL_SOURCE_TOKEN is missing. Fallback to console.");
        console.log("[writerLog:console]", payload);
        return;
      }
      const res = await fetch(ENV.ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ENV.TOKEN}`,
        },
        // Better Stack はプレーンJSON1行でOK
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        // 送信失敗は握りつぶしつつ、診断用に status/本文を warn 出力
        console.warn("[writerLog] failed to send to Better Stack:", res.status, await safeText(res));
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
