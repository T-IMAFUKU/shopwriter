/**
 * /api/writer の固定入力スナップショット（_collect 用）
 *  - OPENAI_API_KEY はダミーにしない（preload で実キー）
 *  - next-auth / openai はモック（外部通信しない）
 *  - ルートは実行時に動的解決（_collect・tests/api の相対深度差を吸収）
 *  - 入力は 8文字以上、可変メタはマスク
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import path from "node:path";
import { pathToFileURL } from "node:url";

// ① NODE_ENV だけ固定（OPENAI_API_KEY はダミー注入しない）
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
    chat = {
      completions: {
        create: async () => ({
          choices: [{ message: { content: "MOCK_OUTPUT" } }],
        }),
      },
    };
  }
  return { default: OpenAI, OpenAI };
});

// ③ ルートは「実行時に動的 import」して相対深度差を吸収
//    - _collect/ からは ../app/... が正、tests/api/ からは ../../app/... が正 などの差を吸収
async function loadWriterRoute(): Promise<{ POST: (req: Request) => Promise<Response> }> {
  const candidates = [
    // まずはプロジェクトルート相対
    path.resolve(process.cwd(), "app/api/writer/route.ts"),
    path.resolve(process.cwd(), "app/api/writer/route.tsx"),
    // 念のため拡張子なし（Bundler解決）
    path.resolve(process.cwd(), "app/api/writer/route"),
  ];

  for (const p of candidates) {
    try {
      const url = pathToFileURL(p).href;
      // eslint-disable-next-line no-await-in-loop
      const mod = (await import(url)) as any;
      if (mod?.POST) return { POST: mod.POST as (req: Request) => Promise<Response> };
    } catch {
      // 次の候補へ
    }
  }
  throw new Error("Failed to locate app/api/writer/route.*");
}

const { POST } = await loadWriterRoute();

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
    vi.unstubAllEnvs(); // cSpell 警告は無視可
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("固定入力(>=8文字) → 安定スナップショット", async () => {
    const req = makeRequest({
      prompt: "これは十分に長いテスト入力です。",
      language: "ja",
    });
    const res = await POST(req as Request);
    const json = await res.json();

    if (!json?.ok) {
      // eslint-disable-next-line no-console
      console.error("writer response (debug):", JSON.stringify(json, null, 2));
    }

    expect(json?.ok).toBe(true);
    expect(typeof json?.output).toBe("string");

    if (json?.meta && typeof json.meta === "object") {
      for (const k of ["now", "timestamp", "tookMs", "elapsedMs", "durationMs"]) {
        if (k in json.meta) delete json.meta[k];
      }
    }

    expect(json).toMatchSnapshot();
  });
});
