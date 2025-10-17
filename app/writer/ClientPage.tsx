"use client";
import { useEffect, useState } from "react";

/**
 * QA-WR-003 安定版
 * - localStorage の読み書きを再同期化
 * - リロード直後も確実に復元されるよう delay 追加
 * - textarea.value を正確に維持
 */

const STORAGE_KEY = "writer_draft_text_v1";

export default function ClientPage() {
  const [text, setText] = useState<string>("");
  const [savedAt, setSavedAt] = useState<string>("");

  // 初回復元
  useEffect(() => {
    const load = () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const obj = JSON.parse(raw) as { text?: string; savedAt?: string };
        if (obj.text) setText(obj.text);
        if (obj.savedAt) setSavedAt(obj.savedAt);
      } catch {}
    };
    load();
    // ページロード後の遅延復元（Next hydration対策）
    setTimeout(load, 500);
  }, []);

  // 保存
  const save = (val: string) => {
    try {
      const now = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ text: val, savedAt: now }));
      setSavedAt(now);
    } catch {}
  };

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);
    save(val);
  };

  const onManualSave = () => save(text);

  const onClear = () => {
    localStorage.removeItem(STORAGE_KEY);
    setText("");
    setSavedAt("");
  };

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold mb-2">Writer Client Page</h1>
      <p className="text-sm text-gray-600 mb-4">
        QA用最小エディタ（E2E: Draft保存→復元 安定版）
      </p>

      <div className="flex gap-3 mb-3">
        <button
          type="button"
          data-testid="save-draft"
          className="rounded px-3 py-2 border border-gray-300"
          onClick={onManualSave}
        >
          下書きを保存
        </button>
        <button
          type="button"
          data-testid="clear-draft"
          className="rounded px-3 py-2 border border-gray-300"
          onClick={onClear}
        >
          下書きを消去
        </button>
      </div>

      <textarea
        data-testid="editor"
        className="w-full h-64 p-3 border rounded resize-vertical"
        placeholder="ここに商品情報や説明文を入力…"
        value={text}
        onChange={onChange}
      />

      <div className="mt-3 text-xs text-gray-500">
        {savedAt ? `最終保存: ${savedAt}` : "未保存"}
      </div>
    </main>
  );
}
