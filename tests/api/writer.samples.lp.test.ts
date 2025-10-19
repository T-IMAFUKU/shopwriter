/**
 * writer samples (lp.basic.json)
 * - LPスタイルでも本文が文字列で得られること
 * - 実ネットワークには出ない（モック前提の緩い検査）
 * - ⏱ タイムアウトは Vitest 互換の「it(..., 12000)」で付与
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

function extractText(json: any): string | undefined {
  if (!json || typeof json !== "object") return undefined;
  if (typeof json.output === "string") return json.output;
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

describe("writer samples (lp.basic.json)", () => {
  beforeAll(async () => {
    await loadRoute();
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it(
    "LPスタイルの各サンプルが data.text（or output）を返し、セクション体裁の最低限を満たす（緩和）",
    async () => {
      const req = makeRequest({
        prompt: "新作アプリのランディングページ用コピーを作成。見出し→特徴→CTA の順で短く。",
        language: "ja",
      });
      const res = await POST(req as Request);
      const json: any = await res.json();

      if (!json?.ok) {
        // eslint-disable-next-line no-console
        console.error("writer response (debug):", JSON.stringify(json, null, 2));
      }

      const text = extractText(json);
      expect(json?.ok).toBe(true);
      expect(typeof text).toBe("string");

      // 体裁の緩い検査（見出し/特徴/CTA らしき行が存在）
      const hasHeadline = /見出し|ヘッドライン|#|\n\n/.test(text!);
      const hasCTA = /CTA|購入|申し込み|お問い合わせ|試す/.test(text!);
      expect(hasHeadline || hasCTA).toBe(true);
    },
    12000 // ← Vitest の per-test timeout（ms）
  );
});
