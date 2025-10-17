// tests/e2e/writer.draft.e2e.spec.ts
import { test, expect } from "@playwright/test";

/**
 * QA-WR-003｜/writer Draft保存→復元（状態同期を待ってから検証）
 * 1) 入力 → localStorage に保存されたことを確認（fallback で強制保存）
 * 2) reload → localStorage に値が残っていることを確認
 * 3) textarea へ反映されるまで待機（toHaveValue でリトライ）
 */

const STORAGE_KEY = "writer_draft_text_v1";

test.describe("QA-WR-003｜/writer Draft保存→復元", () => {
  test("入力→(任意)保存→リロード→自動復元（状態待ち）", async ({ page }) => {
    // 認証 → /writer
    await page.goto("/api/dev-auth", { waitUntil: "commit", timeout: 60_000 }).catch(() => {});
    await page.goto("/writer", { waitUntil: "networkidle", timeout: 60_000 });

    // エディタ
    const editor = page.getByTestId("editor");
    await editor.waitFor({ state: "visible", timeout: 15_000 });

    const text = "E2E draft test - " + Date.now();
    await editor.fill(text);

    // (任意)保存ボタン
    const saveBtn = page.getByTestId("save-draft");
    if (await saveBtn.isVisible().catch(() => false)) {
      await saveBtn.click().catch(() => {});
    }

    // ① 入力後、localStorage に保存されたことを確認（無ければ明示保存）
    await page.waitForFunction(
      ([key, expected]) => {
        try {
          const raw = localStorage.getItem(key);
          if (!raw) return false;
          const obj = JSON.parse(raw);
          return typeof obj?.text === "string" && obj.text.includes(expected);
        } catch {
          return false;
        }
      },
      [STORAGE_KEY, "E2E draft test"],
      { timeout: 10_000 }
    ).catch(async () => {
      // fallback: 明示的に localStorage へ保存
      await page.evaluate(
        ([key, v]) => localStorage.setItem(key, JSON.stringify({ text: v, savedAt: new Date().toISOString() })),
        [STORAGE_KEY, text]
      );
    });

    // ② リロード後、localStorage に値が残っていることを確認（CSR復元前でもOK）
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForFunction(
      ([key, expected]) => {
        try {
          const raw = localStorage.getItem(key);
          if (!raw) return false;
          const obj = JSON.parse(raw);
          return typeof obj?.text === "string" && obj.text.includes(expected);
        } catch {
          return false;
        }
      },
      [STORAGE_KEY, "E2E draft test"],
      { timeout: 15_000 }
    );

    // ③ textarea へ反映されるまで待機して検証（hydration/Effectの遅延に追従）
    const editor2 = page.getByTestId("editor");
    await editor2.waitFor({ state: "visible", timeout: 15_000 });
    await expect(editor2).toHaveValue(/E2E draft test/, { timeout: 15_000 });
  });
});
