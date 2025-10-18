// app/debug/drafts-post/page.tsx
"use client";

import * as React from "react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * DebugDraftsPostPage
 * 目的: /api/drafts への POST をデバッグするための最小フォーム
 * 注意: デバッグ用画面。公開運用には含めない想定。
 */
export default function DebugDraftsPostPage() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setTitle("");
    setContent("");
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      toast.error("タイトルと内容は必須です。");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ title, content }),
      });

      const isJSON = res.headers.get("content-type")?.includes("application/json");
      const data = isJSON ? await res.json().catch(() => ({})) : {};

      if (!res.ok) {
        const msg = (data && (data.message || data.error)) ?? `HTTP ${res.status}`;
        toast.error(`作成に失敗しました: ${msg}`);
        return;
      }

      const id = (data && (data.id || data.shareId || data.draftId)) ?? "(unknown)";
      toast.success(`下書きを作成しました（id: ${id}）`);
      reset();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`ネットワークエラー: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="container mx-auto max-w-2xl px-4 py-8 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Debug: Drafts POST</h1>
        <p className="text-sm text-muted-foreground">
          文字化け復旧済み（UTF-8/BOMなし）。このページはデバッグ用途です。
        </p>
      </header>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="title">タイトル</Label>
          <Input
            id="title"
            placeholder="例）新商品のLPたたき台"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="content">内容</Label>
          <Textarea
            id="content"
            rows={8}
            placeholder="本文（Markdown可の想定。最小限でOK）"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={loading}>
            {loading ? "送信中…" : "下書きを作成"}
          </Button>
          <Button type="button" variant="secondary" onClick={reset} disabled={loading}>
            クリア
          </Button>
        </div>
      </form>

      <section className="text-xs text-muted-foreground">
        <p>
          API: <code>/api/drafts</code> に <code>POST</code>（JSON: {"{"}title, content{"}"}）
        </p>
      </section>
    </main>
  );
}

