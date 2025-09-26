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

/**
 * sns_short のテンプレ（writerPrompt.ts）
 * - Plain text（Markdown禁止）
 * - 3行構成の目安：
 *   ・1行キャッチ
 *   ・本文（60〜100字）
 *   ・ハッシュタグ（2〜3個）
 */
describe("writer samples (sns_short.basic.json)", () => {
  it("SNSショート各サンプルが data.text を返し、メタ一致 ＆ テンプレ要件を満たす（モード別に検査強度を調整）", async () => {
    const file = resolve(process.cwd(), "tests", "samples", "sns_short.basic.json");
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

      // 簡易 noClaims 代表語（誇張・薬機っぽい表現をいくつか）
      const simpleNoNo = ["世界一", "No.1", "奇跡", "完全遮断", "神", "最強"];
      for (const ng of simpleNoNo) {
        expect(text.includes(ng)).toBe(false);
      }

      if (mode === "openai") {
        // ---- 厳密検査（openai 実行時のみ）----
        // Markdown を使っていないこと
        expect(/\*\*|^-\s|\n-\s|`|#+\s/m.test(text)).toBe(false);

        // 3行構成（行頭の全角中黒「・」が少なくとも2行以上）
        const lines = text.split("\n").map((l) => l.trim());
        const midDots = lines.filter((l) => /^・/.test(l)).length;
        expect(midDots).toBeGreaterThanOrEqual(2);

        // 最終行はハッシュタグを最低1つ以上含む（例：「#〇〇」）
        const last = lines[lines.length - 1] || "";
        const hashtags = (last.match(/#[\p{L}\p{N}_]+/gu) || []).length;
        expect(hashtags).toBeGreaterThanOrEqual(1);

        // 本文は60〜100字目安（ここでは 30〜160 のゆるめ検査）
        const bodyLine = lines.find((l) => /^・/.test(l) && /。|．|!|！|？|\w/.test(l) && !/#/.test(l)) || "";
        if (bodyLine) {
          const len = bodyLine.replace(/^・/, "").length;
          expect(len).toBeGreaterThanOrEqual(30);
          expect(len).toBeLessThanOrEqual(160);
        }
      } else {
        // ---- 緩和検査（fake モード：product_card体裁のため）----
        // 少なくとも「強調 or 箇条書き or 全角中黒 or #ハッシュタグ」のどれかがある
        const ok =
          /\*\*.+\*\*/.test(text) || // 強調（fake出力）
          /(^|\n)-\s.+/m.test(text) || // 箇条書き（fake出力）
          /(^|\n)・.+/m.test(text) || // sns_short 期待
          /#[\p{L}\p{N}_]+/gu.test(text); // ハッシュタグ
        expect(ok).toBe(true);
      }
    }
  });
});
