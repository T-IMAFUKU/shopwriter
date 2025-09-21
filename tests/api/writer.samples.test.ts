import { describe, it, expect } from "vitest";
import { readFile } from "fs/promises";
import { resolve } from "path";
import { POST as WriterPost } from "../../app/api/writer/route";

/** JSON リクエスト生成 */
function makeRequest(json: any): Request {
  return new Request("http://localhost/api/writer", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(json),
  });
}

/** ルート呼び出し → JSON取得 */
async function callWriter(json: any) {
  const req = makeRequest(json);
  const res = await WriterPost(req);
  const parsed = await (res as Response).json();
  return parsed;
}

/** 文字列ノーマライズ（バン語チェック用の最低限） */
function normalize(s: string) {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

type SampleCase = {
  id: string;
  note?: string;
  input: any; // WriterInput 互換
  expect: {
    style: string;
    tone: string;
    locale: "ja" | "en";
  };
};

describe("writer samples (product_card.basic.json)", () => {
  it("各サンプルが data.text を返し、メタ一致 & banned語不在を満たすこと", async () => {
    const file = resolve(process.cwd(), "tests", "samples", "product_card.basic.json");
    const buf = await readFile(file, "utf8");
    const samples: SampleCase[] = JSON.parse(buf);

    // 実行（逐次で十分に高速）
    for (const c of samples) {
      const payload = { input: c.input };
      const json = await callWriter(payload);

      // 基本形
      expect(json?.ok).toBe(true);
      expect(typeof json?.data?.text).toBe("string");

      const text = normalize(json.data.text || "");
      expect(text.length).toBeGreaterThan(10); // 最低文字数（ざっくり）

      // メタ一致（style/tone/locale）
      expect(json?.data?.meta?.style).toBe(c.expect.style);
      expect(json?.data?.meta?.tone).toBe(c.expect.tone);
      expect(json?.data?.meta?.locale).toBe(c.expect.locale);

      // banned語の不在チェック（存在する場合のみ）
      const banned = Array.isArray(c.input?.bannedPhrases) ? (c.input.bannedPhrases as string[]) : [];
      for (const ng of banned) {
        if (typeof ng === "string" && ng.trim().length) {
          expect(text.includes(ng)).toBe(false);
        }
      }

      // noClaims（簡易チェック）：効能誇大の代表語が入っていないか（日本語のごく一部だけ）
      // ※ 本格チェックは別途ルールエンジンで実施予定
      const simpleNoNo = ["世界一", "No.1", "奇跡"];
      for (const ng of simpleNoNo) {
        expect(text.includes(ng)).toBe(false);
      }
    }
  });
});
