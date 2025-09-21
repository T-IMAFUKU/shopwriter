"use client";

import React, { useState } from "react";

/**
 * /debug/drafts-post
 * - 蜷御ｸ繧ｪ繝ｪ繧ｸ繝ｳ fetch 縺ｧ /api/drafts 縺ｫ POST 繧帝√ｋ讀懆ｨｼ繝壹・繧ｸ
 * - API 繧ｹ繧ｭ繝ｼ繝橸ｼ嘴 title: string, content: string } 縺ｫ貅匁侠
 */
export default function Page() {
  const [title, setTitle] = useState("繝・せ繝医ち繧､繝医Ν");
  const [content, setContent] = useState("繝・せ繝域悽譁・);
  const [posting, setPosting] = useState(false);
  const [postResult, setPostResult] = useState<any>(null);
  const [getResult, setGetResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const doPost = async () => {
    setPosting(true);
    setError(null);
    setPostResult(null);
    try {
      const res = await fetch("/api/drafts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, content }),
        // 蜷御ｸ繧ｪ繝ｪ繧ｸ繝ｳ縺ｪ縺ｮ縺ｧ Cookie 縺ｯ閾ｪ蜍暮∽ｿ｡・・extAuth 繧ｻ繝・す繝ｧ繝ｳ・・        // credentials: "same-origin",
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          `POST /api/drafts -> ${res.status} ${res.statusText}\n` +
          (data?.message ?? JSON.stringify(data))
        );
      }
      setPostResult(data);
      console.log("[POST] /api/drafts OK:", data);
    } catch (e: any) {
      console.error("[POST] /api/drafts ERROR:", e);
      setError(String(e?.message ?? e));
    } finally {
      setPosting(false);
    }
  };

  const doGet = async () => {
    setError(null);
    setGetResult(null);
    try {
      const res = await fetch("/api/drafts", { method: "GET" });
      const data = await res.json();
      setGetResult(data);
      console.log("[GET] /api/drafts:", data);
    } catch (e: any) {
      console.error("[GET] /api/drafts ERROR:", e);
      setError(String(e?.message ?? e));
    }
  };

  return (
    <main className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">/debug/drafts-post</h1>
      <p className="text-sm text-gray-600">
        /api/drafts 縺ｸ POST 縺ｮ譛蟆乗､懆ｨｼ縲ゅΟ繧ｰ繧､繝ｳ貂医∩縺ｧ螳溯｡後＠縺ｦ縺上□縺輔＞縲・      </p>

      <section className="space-y-3">
        <label className="block">
          <span className="text-sm">title</span>
          <input
            className="block w-full border rounded-md px-3 py-2"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="繧ｿ繧､繝医Ν"
          />
        </label>
        <label className="block">
          <span className="text-sm">content</span>
          <textarea
            className="block w-full border rounded-md px-3 py-2 min-h-[120px]"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="譛ｬ譁・ｼ・ontent・・
          />
        </label>

        <div className="flex gap-2">
          <button
            onClick={doPost}
            disabled={posting}
            className="px-4 py-2 rounded-lg border shadow-sm"
          >
            {posting ? "騾∽ｿ｡荳ｭ窶ｦ" : "POST /api/drafts"}
          </button>
          <button
            onClick={doGet}
            className="px-4 py-2 rounded-lg border shadow-sm"
          >
            GET /api/drafts
          </button>
        </div>
      </section>

      {error && (
        <pre className="whitespace-pre-wrap text-red-600 border p-3 rounded-md">
          {error}
        </pre>
      )}

      {postResult && (
        <section>
          <h2 className="font-semibold mb-1">POST Result</h2>
          <pre className="border p-3 rounded-md overflow-auto">
            {JSON.stringify(postResult, null, 2)}
          </pre>
        </section>
      )}

      {getResult && (
        <section>
          <h2 className="font-semibold mb-1">GET Result</h2>
          <pre className="border p-3 rounded-md overflow-auto">
            {JSON.stringify(getResult, null, 2)}
          </pre>
        </section>
      )}
    </main>
  );
}

