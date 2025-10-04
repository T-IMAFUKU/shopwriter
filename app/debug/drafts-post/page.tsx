// app/debug/drafts-post/page.tsx
"use client";

import { useState } from "react";
import notify from "../../../src/lib/notify";

export default function DraftsPostDebug() {
  const [msg, setMsg] = useState("");
  const [id, setId] = useState("");

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-bold">Debug: Drafts Post</h1>

      <div className="flex space-x-2">
        <input
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          placeholder="メッセージ"
          className="border p-2"
        />
        <input
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="ID"
          className="border p-2"
        />
      </div>

      <div className="space-x-2">
        <button
          className="px-3 py-1 bg-red-500 text-white rounded"
          onClick={() => notify.error(`エラー: ${msg}`)}
        >
          エラー通知
        </button>

        <button
          className="px-3 py-1 bg-green-500 text-white rounded"
          onClick={() => notify.success(`保存成功: ${id}`)}
        >
          成功通知
        </button>
      </div>
    </div>
  );
}
