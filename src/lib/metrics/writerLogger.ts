/**
 * writerLogger.ts
 * - Better Stack(Logtail) 直送 or console の二段構え
 * - Edge/Node両対応: fetch を直接使用（SDK不使用）
 * - 本番は ENV で有効化:
 *   WRITER_LOG_ENABLED=true
 *   WRITER_LOG_MODE=direct        # "console" | "direct"
 *   LOGTAIL_ENDPOINT=https://in.logs.betterstack.com   # 既定。旧 in.logtail.com も自動フォールバック
 *   LOGTAIL_SOURCE_TOKEN=xxxxx
 */

export type WriterPhase = "request" | "success" | "failure";
export type WriterLevel = "INFO" | "WARN" | "ERROR";

export interface WriterLogInput {
  phase: WriterPhase;
  level?: WriterLevel;
  route?: string;
  message?: string;
  requestId?: string;
  provider?: string;
  model?: string;
  durationMs?: number;
  meta?: Record<string, unknown>;
}

/** ENV （undefinedは空にせず、下で明示処理） */
const ENV = {
  ENABLED: process.env.WRITER_LOG_ENABLED,
  MODE: process.env.WRITER_LOG_MODE, // "console" | "direct"
  ENDPOINT: process.env.LOGTAIL_ENDPOINT ?? "https://in.logs.betterstack.com",
  TOKEN_RAW: process.env.LOGTAIL_SOURCE_TOKEN,
  NODE_ENV: process.env.NODE_ENV ?? "development",
};

function isEnabled(): boolean {
  return (ENV.ENABLED ?? "").toLowerCase() === "true";
}
function mode(): "console" | "direct" {
  return ENV.MODE === "direct" ? "direct" : "console";
}

/** 一覧の Message に出す要約 */
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
  const reason = typeof input.meta?.reason === "string" ? ` reason=${String(input.meta!.reason)}` : "";
  const d = typeof input.durationMs === "number" ? ` ${input.durationMs}ms` : "";
  return `failure ${r}${m}${p}${id}${reason}${d}`;
}

async function safeText(res: Response) {
  try { return await res.text(); } catch { return ""; }
}

/** マスク化（先頭4 + 末尾4） */
function maskToken(t: string | undefined): string {
  if (!t || t.length < 8) return "<hidden>";
  return `${t.slice(0, 4)}...${t.slice(-4)}`;
}

/** 旧/新エンドポイント相互フォールバック */
function endpointsForTry(primary: string): string[] {
  const alt = primary.includes("in.logs.betterstack.com")
    ? "https://in.logtail.com"
    : "https://in.logs.betterstack.com";
  return [primary, alt];
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
      message: (input.message ?? buildMessage(input)).slice(0, 512),
      requestId: input.requestId,
      provider: input.provider,
      model: input.model,
      durationMs: input.durationMs,
      meta: input.meta ?? {},
      env: ENV.NODE_ENV,
      service: "writer",
    };

    if (!isEnabled()) {
      /* eslint-disable no-console */
      console.log("[writerLog:disabled]", payload);
      return;
    }

    if (mode() !== "direct") {
      console.log("[writerLog:console]", payload);
      return;
    }

    // 🔒 トークンの不可視文字を削除（401の定番原因）
    const token = (ENV.TOKEN_RAW ?? "").trim();
    if (!token) {
      console.warn("[writerLog] LOGTAIL_SOURCE_TOKEN is missing. Fallback to console.");
      console.log("[writerLog:console]", payload);
      return;
    }

    // まず指定のENDPOINT、401なら旧/新どちらにも自動フォールバック
    const tries = endpointsForTry(ENV.ENDPOINT);
    for (let i = 0; i < tries.length; i++) {
      const url = tries[i];
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) return;

      const body = await safeText(res);
      // 401 だけはフォールバック（次のURLへ）／最後の試行なら warn 出力
      if (res.status === 401 && i + 1 < tries.length) continue;

      console.warn(
        "[writerLog] failed to send to Better Stack:",
        res.status,
        body || "<no-body>",
        `(endpoint=${url} token=${maskToken(token)})`
      );
      return;
    }
  } catch (err) {
    console.warn("[writerLog] error:", err);
  }
}

function defaultLevel(p: WriterPhase): WriterLevel {
  if (p === "failure") return "ERROR";
  if (p === "success") return "INFO";
  return "INFO";
}
