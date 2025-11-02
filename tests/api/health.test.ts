// tests/api/health.test.ts
import { describe, it, expect, beforeAll } from "vitest";

// ルートハンドラを直接呼び出す（Next.js App Router）
import * as HealthRoute from "../../app/api/writer/health/route";

describe("GET /api/writer/health", () => {
  beforeAll(() => {
    // CI/ローカルで OPENAI_API_KEY が未設定でもテスト可能に
    process.env.OPENAI_API_KEY ||= "sk-test-dummy";
  });

  it("should return ok=true and non-empty data (safe-serialized)", async () => {
    // Next.js Route Handler 互換の Request を生成してコール
    const req = new Request("http://localhost/api/writer/health", { method: "GET" });
    // ルートの GET 関数が存在することを保証
    expect(typeof (HealthRoute as any).GET).toBe("function");

    const res = await (HealthRoute as any).GET(req);
    expect(res).toBeInstanceOf(Response);
    expect(res.ok).toBe(true);

    const json = await res.json();

    // 返却shapeの基本
    expect(json).toBeTypeOf("object");
    expect(json.ok).toBe(true);
    expect(json).toHaveProperty("data");

    const data = json.data;
    expect(data).toBeTypeOf("object");

    // env セクション：OPENAI_API_KEY は "set" 表示であること
    expect(data).toHaveProperty("env");
    expect(data.env).toBeTypeOf("object");
    expect(data.env.OPENAI_API_KEY).toBe("set");

    // writer セクション：provider / fewshot 等が存在
    expect(data).toHaveProperty("writer");
    expect(data.writer).toBeTypeOf("object");
    expect(data.writer.provider).toBe("openai");
    expect(typeof data.writer.defaultModel).toBe("string");
    expect(typeof data.writer.defaultTemperature).toBe("number");

    // meta.ts が ISO8601 で、Invalid でない
    expect(data).toHaveProperty("meta");
    const ts = data.meta?.ts;
    expect(typeof ts).toBe("string");
    expect(Number.isNaN(Date.parse(ts))).toBe(false);

    // 安全シリアライズ確認：stringify で例外にならない
    const s = JSON.stringify(json);
    expect(typeof s).toBe("string");
    expect(s.length).toBeGreaterThan(10);
  });
});
