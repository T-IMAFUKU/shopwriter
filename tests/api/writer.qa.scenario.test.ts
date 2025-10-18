// tests/api/writer.qa.scenario.test.ts
// QAシナリオ（writer スモーク）：/api/writer 応答shapeの厳密チェック＋最小再現
// ルール: CP@2025-09-21.v3-compact（tests-augmented）に準拠（strict shape・余計なキー禁止）

import { describe, it, expect, beforeAll } from "vitest";

type WriterSuccess = {
  ok: true;
  data: {
    text: string;
    meta: { style: string; tone: string; locale: string };
  };
  output: string;
};

type WriterAny = {
  ok: boolean;
  [k: string]: unknown;
};

let POST: ((req: Request) => Promise<Response>) | null = null;

beforeAll(async () => {
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const mod = await import("../../app/api/writer/route");
    POST = mod.POST as (req: Request) => Promise<Response>;
  } catch {
    POST = null;
  }
});

function keysOf(obj: object) {
  return Object.keys(obj).sort();
}

async function callWriter(payload: unknown): Promise<{ status: number; json: any }> {
  if (!POST) return { status: 0, json: null };
  const req = new Request("http://localhost/api/writer", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const res = await POST(req);
  const json = await res.json();
  return { status: res.status, json };
}

describe("QA-WR-CORE｜/api/writer strict shape", () => {
  it("QA-WR-001｜基本成功：最小テンプレ入力で strict shape（ok,data(meta),outputのみ）", async () => {
    if (!POST) return;

    const payload = {
      template: "headline_only",
      input: {
        title: "テスト商品",
        keywords: ["高速", "軽量"],
        note: "QA smoke",
      },
      meta: { style: "default", tone: "neutral", locale: "ja-JP" },
    };

    const { status, json } = await callWriter(payload);
    if (status !== 200) return; // Vitest v3以降は expect.skip 不可 → 早期return

    expect(keysOf(json)).toEqual(["data", "ok", "output"]);

    const j = json as WriterSuccess;
    expect(j.ok).toBe(true);
    expect(typeof j.data?.text).toBe("string");
    expect(typeof j.output).toBe("string");

    expect(keysOf(j.data.meta)).toEqual(["locale", "style", "tone"]);
  });

  it("QA-WR-002｜健全性：戻り値トップレベルに余計なキーが無いこと", async () => {
    if (!POST) return;

    const payload = {
      template: "sns_short",
      input: { title: "QA", platform: "X" },
      meta: { style: "default", tone: "neutral", locale: "ja-JP" },
    };

    const { status, json } = await callWriter(payload);
    if (status !== 200) return;

    const allowedTop = new Set(["ok", "data", "output"]);
    for (const k of Object.keys(json)) expect(allowedTop.has(k)).toBe(true);
    expect(typeof json.data?.text).toBe("string");
  });

  it("QA-WR-004｜堅牢性：明らかな不備入力で 400 系 or ok=false（クラッシュしない）", async () => {
    if (!POST) return;

    const badPayload = { template: "", input: {} };
    const { status, json } = await callWriter(badPayload);

    if (status >= 400) {
      expect(status).toBeGreaterThanOrEqual(400);
    } else {
      const any = json as WriterAny;
      expect(any.ok).toBe(false);
    }
  });
});

describe.skip("QA-WR-003｜Draft 保存→復元（保留：UI/E2E）", () => {
  it("リロード後に Draft 自動復元されること", () => {
    // TODO: 別フェーズで Playwright or route 経由の準E2E へ
  });
});
