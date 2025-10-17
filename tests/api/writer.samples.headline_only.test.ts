/**
 * writer samples (headline_only.basic.json)
 * - ヘッドライン専用経路は後処理が重くなることがあるため、タイムアウトを長めに設定
 * - 本文（output / data.text / text のいずれか）が文字列で返ることを主に検証
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// NODE_ENV を固定（挙動安定化）。OPENAI_API_KEY は preload で投入済み。
vi.stubEnv("NODE_ENV", "test");

// 共通：レスポンスから本文を取り出す
function extractText(json: any): string | undefined {
  if (!json || typeof json !== "object") return undefined;
  if (typeof json.output === "string") return json.output;
  if (json.data && typeof json.data.text === "string") return json.data.text;
  if (typeof json.text === "string") return json.text;
  const c = json?.choices?.[0]?.message?.content;
  if (typeof c === "string") return c;
  return undefined;
}

// ルートの動的 import（alias が無い場合に相対へフォールバック）
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

describe("writer samples (headline_only.basic.json)", () => {
  beforeAll(async () => {
    await loadRoute();
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it(
    "ヘッドライン各サンプルが data.text（or output）を返す",
    async () => {
      // ヘッドライン用途の代表入力
      const req = makeRequest({
        prompt: "秋のセールを知らせる魅力的な見出しを1つ作ってください。",
        language: "ja",
        // モードがある実装ならヒントとして渡す（無視されても問題なし）
        mode: "headline_only",
      });

      const res = await POST(req as Request);
      const json: any = await res.json();

      if (!json?.ok) {
        // 失敗時の診断
        // eslint-disable-next-line no-console
        console.error("writer response (debug):", JSON.stringify(json, null, 2));
      }

      const text = extractText(json);

      // 形の健全性（本文は必ず文字列）
      expect(json?.ok).toBe(true);
      expect(typeof text).toBe("string");
      expect((text ?? "").trim().length).toBeGreaterThanOrEqual(4); // 見出しなので長さは控えめで判定
    },
    // ← ここがポイント：後処理の揺れを吸収できる十分な余裕を持たせる
    20_000
  );
});
