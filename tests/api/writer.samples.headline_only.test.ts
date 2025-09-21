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

/** ノーマライズ（スペース/改行最小化） */
function normalize(s: string) {
  return s.replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim();
}

type SampleCase = {
  id: string;
  note?: string;
  input: any; // WriterInput
  expect: { style: string; tone: string; locale: "ja" | "en" };
};

/**
 * headline_only のテンプレ（writerPrompt.ts）
 * - 1行のみ、Markdown禁止
 * - 20〜30字で簡潔（ここでは 12〜40 のゆるめ検査）
 */
describe("writer samples (headline_only.basic.json)", () => {
  it("ヘッドライン各サンプルが data.text を返し、メタ一致＆テンプレ要件を満たす（モード別で検査強度調整）", async () => {
    const file = resolve(process.cwd(), "tests", "samples", "headline_only.basic.json");
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
      const raw = json.data.text || "";
      const text = normalize(raw);
      expect(text.length).toBeGreaterThan(5);

      // banned 語（case ごとに存在する場合のみ）
      const banned = Array.isArray(c.input?.bannedPhrases) ? (c.input.bannedPhrases as string[]) : [];
      for (const ng of banned) {
        if (typeof ng === "string" && ng.trim().length) {
          expect(text.includes(ng)).toBe(false);
        }
      }

      // 代表的な誇張/薬機NGの追加チェック
      const simpleNoNo = ["世界一", "No.1", "奇跡", "完治", "最強", "完全無欠"];
      for (const ng of simpleNoNo) {
        expect(text.includes(ng)).toBe(false);
      }

      if (mode === "openai") {
        // ---- 厳密検査（openai 実行時のみ）----
        // 1行のみ（改行なし）
        expect(/\n/.test(raw)).toBe(false);

        // Markdown禁止：強調/見出し/コード/箇条書きの記号が無い
        expect(/\*\*|__|`|^#|\n#|^- |\n- /m.test(raw)).toBe(false);

        // 文字数レンジ（日本語前提のざっくり判定）
        const len = text.length;
        expect(len).toBeGreaterThanOrEqual(12);
        expect(len).toBeLessThanOrEqual(40);

        // 過度な記号の多用を避ける（!!! や ？？？ など）
        expect(/!!!|？？？|!!!/u.test(text)).toBe(false);
      } else {
        // ---- 緩和検査（fake モード：product_card体裁になりやすいため）----
        // 最低限、1行ヘッドラインっぽい文字列を抽出できること
        // → 先頭行 or 最初の強調ブロックから疑似見出しを取得
        const firstLine = (raw.split(/\r?\n/)[0] || "").trim();
        const strong = (raw.match(/\*\*(.+?)\*\*/)?.[1] || "").trim();
        const candidate = normalize(strong || firstLine);
        expect(candidate.length).toBeGreaterThanOrEqual(4);
      }
    }
  });
});
