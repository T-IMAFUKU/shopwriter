/**
 * /api/writer の固定入力スナップショット
 * ポイント：
 *  - まず env を固定（OPENAI_API_KEY / NODE_ENV）
 *  - 次に外部依存（next-auth / openai）を mock
 *  - 最後に route を「動的 import」で読み込む（順序が最重要）
 *  - 入力は 8文字以上
 *  - 可変メタはマスクして snapshot 安定化
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// ① env を最優先で固定（ルートが module 初期化で参照しても OK になる）
vi.stubEnv("OPENAI_API_KEY", "sk-test-dummy");
vi.stubEnv("NODE_ENV", "test");

// ② 外部依存を mock（ネットワーク/認証を遮断）
vi.mock("next-auth", () => ({
  getServerSession: async () => ({
    user: { id: "test-user-123", name: "Test User" },
    expires: "2099-01-01T00:00:00.000Z",
  }),
}));

vi.mock("openai", () => {
  class OpenAI {
    responses = { create: async () => ({ output: "MOCK_OUTPUT" }) };
    chat = { completions: { create: async () => ({ choices: [{ message: { content: "MOCK_OUTPUT" } }] }) } };
  }
  return { default: OpenAI, OpenAI };
});

// ③ ルートは「あとから」読み込む。alias不成立時は相対パスにフォールバック
let POST: (req: Request) => Promise<Response>;
try {
  ({ POST } = await import("@/app/api/writer/route"));
} catch {
  ({ POST } = await import("../../app/api/writer/route"));
}

// 便利関数
function makeRequest(body: unknown) {
  return new Request("http://localhost/api/writer", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
}

describe("/api/writer snapshot", () => {
  beforeAll(() => {
    vi.useFakeTimers().setSystemTime(new Date("2025-01-01T00:00:00Z"));
  });

  afterAll(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("固定入力(>=8文字) → 安定スナップショット", async () => {
    // ④ バリデーションを満たす十分な長さの入力
    const req = makeRequest({ prompt: "これは十分に長いテスト入力です。", language: "ja" });
    const res = await POST(req as Request);
    const json = await res.json();

    // 失敗時の診断をログへ
    if (!json?.ok) {
      // eslint-disable-next-line no-console
      console.error("writer response (debug):", JSON.stringify(json, null, 2));
    }

    // 形の健全性
    expect(json?.ok).toBe(true);
    expect(typeof json?.output).toBe("string");

    // 可変メタのマスク
    if (json?.meta && typeof json.meta === "object") {
      for (const k of ["now", "timestamp", "tookMs", "elapsedMs", "durationMs"]) {
        if (k in json.meta) delete json.meta[k];
      }
    }

    // スナップショット
    expect(json).toMatchSnapshot();
  });
});
