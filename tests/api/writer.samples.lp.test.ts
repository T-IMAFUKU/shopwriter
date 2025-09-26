import { describe, it, expect } from "vitest";
import { readFile } from "fs/promises";
import { resolve } from "path";
import { POST as WriterPost } from "../../app/api/writer/route";

/** テスト用 Request 生成 */
function makeRequest(json: any): Request {
  return new Request("http://localhost/api/writer", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(json),
  });
}

/** ルート呼び出し → JSON */
async function callWriter(json: any) {
  const req = makeRequest(json);
  const res = await WriterPost(req);
  const parsed = await (res as Response).json();
  return parsed;
}

/** 簡易ノーマライズ */
function normalize(s: string) {
  return s.replace(/\r\n/g, "\n").trim();
}

type SampleCase = {
  id: string;
  note?: string;
  input: any; // WriterInput
  expect: { style: string; tone: string; locale: "ja" | "en" };
};

describe("writer samples (lp.basic.json)", () => {
  it("LPスタイルの各サンプルが data.text を返し、メタ一致 &（openai時のみ）セクション体裁を満たす", async () => {
    const file = resolve(process.cwd(), "tests", "samples", "lp.basic.json");
    const buf = await readFile(file, "utf8");
    const samples: SampleCase[] = JSON.parse(buf);

    for (const c of samples) {
      const json = await callWriter({ input: c.input });

      // 基本形
      expect(json?.ok).toBe(true);
      expect(typeof json?.data?.text).toBe("string");
      expect(json?.data?.meta?.style).toBe(c.expect.style);
      expect(json?.data?.meta?.tone).toBe(c.expect.tone);
      expect(json?.data?.meta?.locale).toBe(c.expect.locale);

      const mode = json?.data?.meta?.mode ?? "fake";
      const text = normalize(json.data.text || "");
      expect(text.length).toBeGreaterThan(10);

      // banned 語（case ごとに存在する場合のみ）
      const banned = Array.isArray(c.input?.bannedPhrases) ? (c.input.bannedPhrases as string[]) : [];
      for (const ng of banned) {
        if (typeof ng === "string" && ng.trim().length) {
          expect(text.includes(ng)).toBe(false);
        }
      }

      // NODE_ENV=test では fake モードのため、厳密な LP 見出し検査はスキップ。
      // 本番/OPENAIキーありで mode=openai の場合にのみ、LPテンプレの節構成を軽く検査。
      if (mode === "openai") {
        // 期待：LPテンプレ（writerPrompt.ts）に基づく主要セクション
        const hasH2 = /^##\s?.+/m.test(text);
        const hasBenefit = /^###\s?ベネフィット/m.test(text);
        const hasDetail = /^###\s?詳細説明/m.test(text);
        const hasSpecs = /^###\s?仕様/m.test(text);

        expect(hasH2).toBe(true);
        expect(hasBenefit).toBe(true);
        expect(hasDetail).toBe(true);
        expect(hasSpecs).toBe(true);
      } else {
        // fake モード時：最低限、Markdown らしさ（強調 or 箇条書き）があることだけ確認
        const hasEmphasis = /\*\*.+\*\*/.test(text);
        const hasBullets = /(^|\n)-\s.+/m.test(text);
        expect(hasEmphasis || hasBullets).toBe(true);
      }
    }
  });
});
