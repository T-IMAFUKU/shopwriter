/**
 * Precision Plan（実測）:
 * - このテストだけ openai モックを解除して /api/writer を実叩き
 * - 出力の再現性（バラつき）と速度を簡易定量化
 * - 実行回数は最小限（3回）で課金を極小化
 *
 * 前提:
 * - NODE_OPTIONS=--require=./tests/preload-env.cjs で OPENAI_API_KEY を注入済み
 * - vitest.config.ts は setupFiles に tests/setup.writers.ts が入っている想定
 *   → 本テスト内で `vi.unmock("openai")` を宣言してモック解除し、動的 import
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// Vitest の実行デフォルト 5s だと足りないことがあるため、このスイート内は余裕を持たせる
const TEST_TIMEOUT_MS = 20000;

// 便利関数: リクエスト作成
function makeRequest(body: unknown) {
  return new Request("http://localhost/api/writer", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
}

// シンプルなトークン化（日本語でも空白・句読点でそこそこ分割）
function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[、。！？!?,.\n\r]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// トークン重複率（Jaccard に近い簡易版: 共有トークン / 和集合）
function tokenOverlap(a: string, b: string): number {
  const A = new Set(tokenize(a));
  const B = new Set(tokenize(b));
  const inter = new Set([...A].filter((x) => B.has(x)));
  const uni = new Set([...A, ...B]);
  return uni.size ? inter.size / uni.size : 0;
}

describe("Precision Plan /api/writer (real OpenAI)", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeAll(async () => {
    // ※ setup.writers.ts で openai をモックしているため、ここで解除
    vi.unmock("openai");
    vi.resetModules();

    // 認証だけは引き続きモックのままでOK（ネットワーク遮断）
    // ルートは「あとから」読み込む（初期化順序が重要）
    try {
      ({ POST } = await import("@/app/api/writer/route"));
    } catch {
      ({ POST } = await import("../../app/api/writer/route"));
    }
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it(
    "同一プロンプト x3 回の実測で、構造・速度・再現性を確認する",
    async () => {
      const prompt =
        "Precision Plan 用の短文応答テストです。50文字前後で、見出し風のリード文を1つだけ返してください。";
      const payload = { prompt, language: "ja" };

      const N = 3; // 叩く回数（費用最小化）
      const outputs: string[] = [];
      const metas: Array<Record<string, unknown>> = [];
      const times: number[] = [];

      for (let i = 0; i < N; i++) {
        const start = performance.now();
        const res = await POST(makeRequest(payload));
        const json = await res.json();
        const end = performance.now();

        // 形状（ok と本文の在処）をゆるく吸収
        const ok = json?.ok === true;
        const text: string | undefined =
          json?.output ?? json?.text ?? json?.data?.text;

        // 速度（ms）
        times.push(end - start);

        // 失敗時は詳細を出して即落とす
        if (!ok || typeof text !== "string" || text.trim().length === 0) {
          // eslint-disable-next-line no-console
          console.error("writer response (debug):", JSON.stringify(json, null, 2));
          throw new Error("writer response shape invalid");
        }

        outputs.push(String(text));
        metas.push(json?.meta ?? json?.data?.meta ?? {});
      }

      // --- 再現性（ばらつき）を簡易評価
      const uniqueCount = new Set(outputs).size;

      // すべてのペアで重複率を計算し平均
      const overlaps: number[] = [];
      for (let i = 0; i < outputs.length; i++) {
        for (let j = i + 1; j < outputs.length; j++) {
          overlaps.push(tokenOverlap(outputs[i], outputs[j]));
        }
      }
      const avgOverlap =
        overlaps.length === 0
          ? 1
          : overlaps.reduce((a, b) => a + b, 0) / overlaps.length;

      // --- 速度統計
      const avgMs = times.reduce((a, b) => a + b, 0) / times.length;
      const maxMs = Math.max(...times);
      const minMs = Math.min(...times);

      // コンソールへ実測まとめ（CIログにも出る）
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify(
          {
            precision_plan_summary: {
              N,
              unique_outputs: uniqueCount,
              avg_token_overlap: Number(avgOverlap.toFixed(3)),
              time_ms: {
                min: Math.round(minMs),
                avg: Math.round(avgMs),
                max: Math.round(maxMs),
              },
              samples: outputs,
              metas,
            },
          },
          null,
          2
        )
      );

      // 最低限の検証（構造健全性）
      expect(uniqueCount).toBeGreaterThanOrEqual(1);
      expect(avgMs).toBeGreaterThan(0);
    },
    TEST_TIMEOUT_MS
  );
});
