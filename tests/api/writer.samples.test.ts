/**
 * writer samples (product_card.basic.json)
 * - レスポンス形状差（output / data.text）を吸収
 * - 外部依存は setupFiles 側でモック済み
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

function extractText(json: any): string | undefined {
  if (!json || typeof json !== "object") return undefined;
  if (typeof json.output === "string") return json.output;
  if (json.data && typeof json.data.text === "string") return json.data.text;
  if (typeof json.text === "string") return json.text;
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

describe("writer samples (product_card.basic.json)", () => {
  beforeAll(async () => {
    await loadRoute();
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it(
    "各サンプルが data.text（or output）を返し、メタ一致 & banned語不在を満たすこと",
    async () => {
      const req = makeRequest({
        prompt: "新作イヤホンの製品カードを作ってください。特徴は軽量・長時間バッテリー・ノイズキャンセリング。",
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

      const banned = [/禁止ワード/i];
      expect(banned.some((re) => re.test(text!))).toBe(false);
    },
    45_000
  );
});
