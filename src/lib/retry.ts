// src/lib/retry.ts  ← 新規追加（全文）
// 目的: 外部API呼び出しの恒久対策（リトライ＋指数バックオフ＋ジッタ＋締切）を共通化。
// 使い方:
//   const res = await retry(() => fetch(url, init), { shouldRetry: isTransientHttpError });
//   const json = await res.json();

export type RetryOptions = {
  attempts?: number;          // 最大試行回数（初回+リトライを含む）
  minDelayMs?: number;        // 最初の待機
  maxDelayMs?: number;        // 後続の上限待機
  deadlineMs?: number;        // 全体の締切（これを超えたら即中止）
  jitterRatio?: number;       // ジッタ係数（0〜1）
  shouldRetry?: (e: unknown, attempt: number) => boolean | Promise<boolean>;
  onAttempt?: (info: { attempt: number; error?: unknown }) => void;
  signal?: AbortSignal;       // さらに外部から中断したい場合
};

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    if (signal) {
      const onAbort = () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      };
      if (signal.aborted) onAbort();
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });

function expBackoff(attempt: number, minMs: number, maxMs: number, jitter: number) {
  // attempt: 1,2,3...
  const base = Math.min(maxMs, minMs * Math.pow(2, attempt - 1));
  const rand = 1 + (Math.random() * 2 - 1) * jitter; // 1±jitter
  return Math.max(0, Math.floor(base * rand));
}

export async function retry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const attempts = Math.max(1, opts.attempts ?? 3);        // 既定: 最大3回
  const minDelay = Math.max(50, opts.minDelayMs ?? 200);    // 200ms から
  const maxDelay = Math.max(minDelay, opts.maxDelayMs ?? 2000);
  const deadline = opts.deadlineMs ?? 30_000;               // 全体30s
  const jitter = Math.min(1, Math.max(0, opts.jitterRatio ?? 0.3));
  const shouldRetry = opts.shouldRetry ?? (() => true);

  const startedAt = Date.now();

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      opts.onAttempt?.({ attempt, error: e });

      const timeSpent = Date.now() - startedAt;
      const left = deadline - timeSpent;
      const canTryMore = attempt < attempts && left > 0;

      if (!canTryMore) throw e;
      const ok = await Promise.resolve(shouldRetry(e, attempt));
      if (!ok) throw e;

      const wait = Math.min(left, expBackoff(attempt, minDelay, maxDelay, jitter));
      await sleep(wait, opts.signal);
      // 次ループで再試行
    }
  }
  // ここには来ない
  throw new Error("unreachable");
}

// HTTP用: 一時エラー判定（429, 500, 502, 503, 504＋ネットワーク系）
export function isTransientHttpError(err: unknown): boolean {
  // fetchが投げるネットワークError
  if (err instanceof TypeError) return true;
  const any = err as any;
  const status: number | undefined = any?.status ?? any?.response?.status;
  if (typeof status !== "number") return false;
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}
