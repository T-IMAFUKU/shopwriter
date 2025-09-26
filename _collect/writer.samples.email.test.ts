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
 * email のテンプレ（writerPrompt.ts）
 * Return as markdown:
 * 件名: ...
 *
 * 本文:
 * - 冒頭：...
 * - 本文：...
 * - 結び：...
 */
describe("writer samples (email.basic.json)", () => {
  it("メール各サンプルが data.text を返し、メタ一致＆テンプレ要件を満たす（モード別に検査強度を調整）", async () => {
    const file = resolve(process.cwd(), "tests", "samples", "email.basic.json");
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
      const simpleNoNo = ["世界一", "No.1", "奇跡", "完治", "神音質", "完全無欠"];
      for (const ng of simpleNoNo) {
        expect(text.includes(ng)).toBe(false);
      }

      if (mode === "openai") {
        // ---- 厳密検査（openai 実行時のみ）----
        // 1) 件名行（先頭〜数行のどこかに「件名: 」から始まる行）
        const hasSubject = /^件名:\s?.+/m.test(text);
        expect(hasSubject).toBe(true);

        // 2) 本文セクションの見出し
        const hasBodyHeader = /^本文:\s*$/m.test(text) || /^本文:\s*\n/m.test(text);
        expect(hasBodyHeader).toBe(true);

        // 3) 箇条書きで「冒頭/本文/結び」が1つずつ
        const hasIntro = /^-\s?冒頭：.+/m.test(text);
        const hasMain = /^-\s?本文：.+/m.test(text);
        const hasClose = /^-\s?結び：.+/m.test(text);
        expect(hasIntro && hasMain && hasClose).toBe(true);

        // 4) 件名の過度な煽り回避（「！」3連など極端なものは避けられている想定）
        const subjectLine = (text.match(/^件名:\s?.+$/m) || [])[0] || "";
        expect(/！！|!!!/.test(subjectLine)).toBe(false);

        // 5) 本文の長さ（ゆるめ）：合計200〜600文字目安（日本語前提のざっくり）
        const charCount = text.replace(/^件名:.*$/m, "").replace(/[\n\s]/g, "").length;
        expect(charCount).toBeGreaterThanOrEqual(50);
        expect(charCount).toBeLessThanOrEqual(1000);
      } else {
        // ---- 緩和検査（fake モード：product_card体裁のため）----
        // Markdown の構造が最低限ある（強調 or 箇条書き）
        const ok =
          /\*\*.+\*\*/.test(text) || // 強調
          /(^|\n)-\s.+/m.test(text); // 箇条書き
        expect(ok).toBe(true);
      }
    }
  });
});
