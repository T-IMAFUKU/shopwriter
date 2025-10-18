/**
 * /api/writer の固定入力“形の健全性”チェック（スナップショット撤廃）
 * - ENV は preload（--require=./tests/preload-env.cjs）
 * - next-auth / openai は setupFiles でモック済み
 * - ルートは動的 import（mock → import の順序担保）
 * - 入力は 8文字以上
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

function extractText(json: any): string | undefined {
  if (!json || typeof json !== "object") return undefined;
  if (typeof json.output === "string") return json.output;
  if (typeof json.text === "string") return json.text;
  if (json.data && typeof json.data.text === "string") return json.data.text;
  const c = json?.choices?.[0]?.message?.content;
  if (typeof c === "string") return c;
  return undefined;
}

vi.stubEnv("NODE_ENV", "test");

let POST: (req: Request) => Promise<Response>;
async function loadRoute() {
  try {
    ({ POST } = await import("@/app/api/writer/route"));
  } catch {
    ({ POST } = await import("../../app/api/writer/route"));
  }
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/writer", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
}

describe("/api/writer snapshot-less shape check", () => {
  beforeAll(async () => {
    vi.useFakeTimers().setSystemTime(new Date("2025-01-01T00:00:00Z"));
    await loadRoute();
  });

  afterAll(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it(
    "固定入力(>=8文字) → ok=true かつ 文字列本文が返る",
    async () => {
      const req = makeRequest({ prompt: "これは十分に長いテスト入力です。", language: "ja" });
      const res = await POST(req as Request);
      const json: any = await res.json();

      if (!json?.ok) {
        // eslint-disable-next-line no-console
        console.error("writer response (debug):", JSON.stringify(json, null, 2));
      }

      const text = extractText(json);
      expect(json?.ok).toBe(true);
      expect(typeof text).toBe("string");
    },
    15_000 // ← タイムアウト余裕
  );
});
