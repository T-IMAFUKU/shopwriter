// app/api/writer/_shared/logger.ts
// Writer ログ周りのユーティリティを集約するモジュール
// - route.ts から切り出しただけで挙動は不変

import { createHash } from "node:crypto";

export type WriterLogKind = "ok" | "error";

/**
 * WRITER_LOG=0 の場合はログ全体を抑止するフラグ
 * - 未設定 or "1" の場合は有効
 */
export const WRITER_LOG_ENABLED =
  String(process.env.WRITER_LOG ?? "1") !== "0";

/**
 * テキストの SHA-256 を 16進文字列で返すヘルパー
 * - ログ用に短縮して使う前提
 */
export function sha256Hex(s: string): string {
  return createHash("sha256").update(s || "").digest("hex");
}

/**
 * 観測ログ関数:
 * - WRITER_LOG_ENABLED が "0" でなければ console.log
 * - Better Stack 送信は emitWriterEvent() が別途やる
 */
export function logEvent(kind: WriterLogKind, payload: any): void {
  if (!WRITER_LOG_ENABLED) return;
  const wrapped = {
    ts: new Date().toISOString(),
    route: "/api/writer",
    kind,
    ...payload,
  };
  console.log("WRITER_EVENT " + JSON.stringify(wrapped));
}

/**
 * 強制ログ:
 * - 環境変数に関係なく必ず console.log する
 * - Vercel の "No logs found" を避けるための最終保証
 */
export function forceConsoleEvent(
  kind: WriterLogKind,
  payload: any,
): void {
  try {
    const wrapped = {
      ts: new Date().toISOString(),
      route: "/api/writer",
      kind,
      ...payload,
    };
    console.log("WRITER_EVENT " + JSON.stringify(wrapped));
  } catch {
    // 握りつぶす
  }
}

/* =========================
   🔵 Better Stack Direct Ingest
   - WRITER_LOG_MODE=direct の時だけ有効
========================= */

const WRITER_LOG_MODE = String(
  process.env.WRITER_LOG_MODE ?? "",
).toLowerCase();

const LOGTAIL_ENDPOINT =
  process.env.LOGTAIL_ENDPOINT ?? "https://in.logtail.com";

/**
 * Better Stack(Logtail) への直接送信
 * - WRITER_LOG_ENABLED が true
 * - WRITER_LOG_MODE=direct
 * - LOGTAIL_SOURCE_TOKEN が設定されている
 * 時だけ動く
 */
export async function emitWriterEvent(
  kind: WriterLogKind,
  payload: any,
): Promise<void> {
  try {
    if (!WRITER_LOG_ENABLED) return;
    if (WRITER_LOG_MODE !== "direct") return;

    const token = process.env.LOGTAIL_SOURCE_TOKEN;
    if (!token) return;

    const body = {
      event: "WRITER_EVENT",
      route: "/api/writer",
      kind,
      payload,
      ts: new Date().toISOString(),
      env: process.env.VERCEL_ENV ?? "local",
    };

    await fetch(LOGTAIL_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (e: any) {
    console.warn("emitWriterEvent failed:", e?.message ?? "unknown");
  }
}
