// src/lib/metrics/writerLogger.ts  ← 全文置換（恒久対策：retry適用）
//
// - Node.js ランタイムのみで Better Stack に送信（ブラウザ/Edgeでは送らない）
// - 202/204 を成功扱い、401 は即終了、429/5xx/ネットワーク失敗は retry（指数バックオフ＋ジッタ）
// - アプリは止めない（best-effort）
// - 既存 API: writerLog() / writerLogger.log() は互換のまま

import { retry, isTransientHttpError } from "@/lib/retry";

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

// 実行環境の簡易判定
const IS_NODE =
  typeof process !== "undefined" &&
  // @ts-ignore
  (process.release?.name === "node" || process.versions?.node);

const ENV = {
  ENABLED: (process.env?.WRITER_LOG_ENABLED ?? "").toLowerCase() === "true",
  MODE: (process.env?.WRITER_LOG_MODE ?? "direct") as "console" | "direct",
  ENDPOINT: (process.env?.LOGTAIL_ENDPOINT ?? "").trim(), // 固有URL 必須
  TOKEN: (process.env?.LOGTAIL_SOURCE_TOKEN ?? "").trim(),
  NODE_ENV: process.env?.NODE_ENV ?? "development",
};

const DEFAULT_ROUTE = "/api/writer";
const SERVICE = "writer";
const PER_ATTEMPT_TIMEOUT_MS = 2500;   // 1回の送信タイムアウト
const DEADLINE_MS = 10_000;            // リトライ合計の締切（送信処理全体）

function maskToken(t: string): string {
  if (!t || t.length < 8) return "<hidden>";
  return `${t.slice(0, 4)}...${t.slice(-4)}`;
}
async function safeText(res: Response) { try { return await res.text(); } catch { return ""; } }

function buildMessage(input: WriterLogInput): string {
  const r = input.route ?? DEFAULT_ROUTE;
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

async function postOnce(endpoint: string, token: string, body: unknown, signal: AbortSignal) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal,
  });

  // 成功
  if (res.status === 202 || res.status === 204) return res;

  // 401 は即終了（資格情報エラーは隠さない）
  if (res.status === 401) {
    const text = await safeText(res);
    const err = Object.assign(new Error(`unauthorized (401): ${text || "<no-body>"}`), { status: 401 });
    throw err;
  }

  // それ以外は HTTP エラーとして投げ、上位でリトライ判定
  const text = await safeText(res);
  const err = Object.assign(new Error(`http ${res.status}: ${text || "<no-body>"}`), { status: res.status });
  throw err;
}

async function sendToBetterStack(payload: unknown) {
  // 非 Node（ブラウザ/Edge）は送らない
  if (!IS_NODE) { console.log("[writerLog:no-node-runtime]", payload); return; }

  if (!ENV.ENABLED) { console.log("[writerLog:disabled]", payload); return; }
  if (ENV.MODE !== "direct") { console.log("[writerLog:console]", payload); return; }

  if (!ENV.ENDPOINT || !ENV.TOKEN) {
    console.warn("[writerLog] missing endpoint/token. endpoint=%s token=%s",
      ENV.ENDPOINT || "<empty>", maskToken(ENV.TOKEN));
    console.log("[writerLog:console]", payload);
    return;
  }

  // 合計締切（DEADLINE_MS）を守りつつ、各試行は個別タイムアウト
  const controller = new AbortController();
  const deadlineTimer = setTimeout(() => controller.abort(), DEADLINE_MS);

  try {
    await retry(
      async () => {
        // 試行ごとに個別タイマー
        const perAttempt = new AbortController();
        const perTimer = setTimeout(() => perAttempt.abort(), PER_ATTEMPT_TIMEOUT_MS);

        try {
          return await postOnce(ENV.ENDPOINT, ENV.TOKEN, payload, perAttempt.signal);
        } finally {
          clearTimeout(perTimer);
        }
      },
      {
        attempts: 3,                    // 最大3回（初回＋リトライ2回）
        minDelayMs: 250,               // 250ms → 500ms → 1000ms（上限2s、ジッタあり）
        maxDelayMs: 2000,
        jitterRatio: 0.3,
        deadlineMs: DEADLINE_MS,
        shouldRetry: (e) => isTransientHttpError(e),  // 429/5xx/ネットワークのみ再試行
        onAttempt: ({ attempt, error }) => {
          if (attempt > 1) console.warn("[writerLog:retry]", attempt, (error as any)?.message ?? error);
        },
        signal: controller.signal,
      }
    );
  } catch (err: any) {
    // 最終失敗でもアプリは止めない
    console.warn(
      "[writerLog] final-fail:", err?.message ?? err,
      `(endpoint=${ENV.ENDPOINT} token=${maskToken(ENV.TOKEN)})`
    );
  } finally {
    clearTimeout(deadlineTimer);
  }
}

export async function writerLog(input: WriterLogInput): Promise<void> {
  try {
    const now = new Date().toISOString();
    const payload = {
      ts: now,
      phase: input.phase,
      level: input.level ?? defaultLevel(input.phase),
      route: input.route ?? DEFAULT_ROUTE,
      message: (input.message ?? buildMessage(input)).slice(0, 512),
      requestId: input.requestId,
      provider: input.provider,
      model: input.model,
      durationMs: input.durationMs,
      meta: input.meta ?? {},
      env: ENV.NODE_ENV,
      service: SERVICE,
    };
    await sendToBetterStack(payload);
  } catch (err) {
    console.warn("[writerLog] unexpected:", err);
  }
}

function defaultLevel(p: WriterPhase): WriterLevel {
  if (p === "failure") return "ERROR";
  if (p === "success") return "INFO";
  return "INFO";
}

// 互換エイリアス
export const writerLogger = { log: writerLog };
