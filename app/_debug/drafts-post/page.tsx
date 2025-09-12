"use client";

import * as React from "react";

type DraftInput = {
  title: string;
  body: string;
  category?: string;
  tags?: string[];
};

type ApiDraft = {
  id: string | number;
  title: string;
  body?: string | null;
  category?: string | null;
  tags?: string[] | null;
  createdAt?: string;
  updatedAt?: string;
  userId?: string | number;
};

export default function Page() {
  const [title, setTitle] = React.useState("テストタイトル");
  const [body, setBody] = React.useState("これはテスト本文です（/debug/drafts-post から送信）");
  const [category, setCategory] = React.useState("debug");
  const [tags, setTags] = React.useState("debug,post");
  const [posting, setPosting] = React.useState(false);
  const [postStatus, setPostStatus] = React.useState<null | number>(null);
  const [postJson, setPostJson] = React.useState<any>(null);

  const [getting, setGetting] = React.useState(false);
  const [getStatus, setGetStatus] = React.useState<null | number>(null);
  const [latest, setLatest] = React.useState<ApiDraft | null>(null);
  const [list, setList] = React.useState<ApiDraft[] | null>(null);

  const toPayload = (): DraftInput => ({
    title: title.trim(),
    body: body.trim(),
    category: category.trim() || undefined,
    tags:
      tags
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean) || undefined,
  });

  const doPost = async () => {
    setPosting(true);
    setPostStatus(null);
    setPostJson(null);
    try {
      const resp = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // NextAuthのセッションCookieを送る
        credentials: "include",
        body: JSON.stringify(toPayload()),
      });
      setPostStatus(resp.status);

      let data: any = null;
      const text = await resp.text();
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = { raw: text };
      }
      setPostJson(data);
    } catch (e: any) {
      setPostStatus(-1);
      setPostJson({ error: String(e?.message || e) });
    } finally {
      setPosting(false);
    }
  };

  const doGet = async () => {
    setGetting(true);
    setGetStatus(null);
    setLatest(null);
    setList(null);
    try {
      const resp = await fetch("/api/drafts", {
        method: "GET",
        credentials: "include",
      });
      setGetStatus(resp.status);
      const data = await resp.json().catch(() => null);

      // 返り値の形が配列 or {items:[...]} or 単体 などに対応
      let items: ApiDraft[] = [];
      if (Array.isArray(data)) {
        items = data;
      } else if (data?.items && Array.isArray(data.items)) {
        items = data.items;
      } else if (data) {
        items = [data];
      }

      setList(items);
      if (items.length > 0) {
        // createdAt/updatedAt で新しい順に
        const sorted = [...items].sort((a, b) => {
          const ta = new Date(a.updatedAt || a.createdAt || 0).getTime();
          const tb = new Date(b.updatedAt || b.createdAt || 0).getTime();
          return tb - ta;
        });
        setLatest(sorted[0]);
      }
    } catch (e: any) {
      setGetStatus(-1);
      setList(null);
      setLatest(null);
    } finally {
      setGetting(false);
    }
  };

  const POST_OK = postStatus === 200 || postStatus === 201;
  const GET_OK = getStatus === 200;

  return (
    <main className="p-6 max-w-3xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold">/debug/drafts-post</h1>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">1) POST /api/drafts 検証</h2>

        <div className="grid gap-2">
          <label className="text-sm">Title</label>
          <input
            className="border rounded px-3 py-2"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="タイトル"
          />
        </div>

        <div className="grid gap-2">
          <label className="text-sm">Body</label>
          <textarea
            className="border rounded px-3 py-2 min-h-[120px]"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="本文"
          />
        </div>

        <div className="grid gap-2">
          <label className="text-sm">Category (任意)</label>
          <input
            className="border rounded px-3 py-2"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="カテゴリ"
          />
        </div>

        <div className="grid gap-2">
          <label className="text-sm">Tags（カンマ区切り, 任意）</label>
          <input
            className="border rounded px-3 py-2"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="debug,post"
          />
        </div>

        <button
          onClick={doPost}
          disabled={posting}
          className="rounded px-4 py-2 border shadow"
        >
          {posting ? "送信中..." : "POST /api/drafts を送る"}
        </button>

        <div className="text-sm">
          <div>POST_STATUS: <b>{postStatus ?? "-"}</b></div>
          <div>POST_OK: <b>{String(POST_OK)}</b></div>
        </div>

        <pre className="text-xs bg-gray-50 border rounded p-3 overflow-auto">
{JSON.stringify(postJson, null, 2)}
        </pre>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">2) GET /api/drafts 検証（直前レコードの確認）</h2>
        <button
          onClick={doGet}
          disabled={getting}
          className="rounded px-4 py-2 border shadow"
        >
          {getting ? "取得中..." : "GET /api/drafts を取得"}
        </button>

        <div className="text-sm">
          <div>GET_STATUS: <b>{getStatus ?? "-"}</b></div>
          <div>GET_OK: <b>{String(GET_OK)}</b></div>
        </div>

        <div className="text-sm">
          <div className="font-semibold">Latest (推定):</div>
          <pre className="text-xs bg-gray-50 border rounded p-3 overflow-auto">
{JSON.stringify(latest, null, 2)}
          </pre>
        </div>

        <div className="text-sm">
          <div className="font-semibold">List (サマリ):</div>
          <pre className="text-xs bg-gray-50 border rounded p-3 overflow-auto">
{JSON.stringify(list, null, 2)}
          </pre>
        </div>
      </section>

      <section className="text-sm text-gray-600">
        <p>
          注意：このページは <code>credentials: "include"</code> でセッションCookieを送ります。
          サインイン済み（/writer 経由でGitHub OAuth成功）であることが前提です。
        </p>
      </section>
    </main>
  );
}
