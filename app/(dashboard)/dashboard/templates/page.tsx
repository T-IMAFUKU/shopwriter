"use client"; // ← 必ず最上行

// 【CP@2025-09-21.v3】適用：検索クエリ依存のため静的化を禁止
export const dynamic = 'force-dynamic';

import * as React from "react";
import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MoreHorizontal, Plus, RotateCw } from "lucide-react";
import { notify } from "@/lib/notify";

// --- EventLog POST (UI用) ---
async function logEventUI(
  category: "ui",
  event: "template.select",
  level: "INFO",
  payload: Record<string, unknown>,
  userId?: string | number
) {
  try {
    await fetch("/api/eventlog", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(userId ? { "X-User-Id": String(userId) } : {}),
      },
      body: JSON.stringify({ category, event, level, payload }),
      cache: "no-store",
    });
  } catch {}
}

type TemplateItem = {
  id: string;
  title: string;
  body?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
};

// 中身はそのまま：ページ内ロジックを分離
function TemplatesInner() {
  const { data: session } = useSession();

  const userId =
    session?.user && "id" in session.user ? String((session.user as any).id) : undefined;

  const [items, setItems] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [creating, setCreating] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [updating, setUpdating] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/templates", { method: "GET", cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const arr: any[] = Array.isArray(json) ? json : json?.data ?? json?.items ?? [];
      setItems(
        arr.map((t) => ({
          id: String(t.id ?? ""),
          title: String(t.title ?? ""),
          body: t.body ?? "",
          updatedAt: t.updatedAt ?? null,
          createdAt: t.createdAt ?? null,
        }))
      );
    } catch (e: any) {
      setError(e?.message ?? "Fetch error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const rows = useMemo(
    () =>
      items.map((t) => ({
        id: t.id,
        title: t.title || "(no title)",
        updatedAt: t.updatedAt ? new Date(t.updatedAt).toLocaleString() : "-",
      })),
    [items]
  );

  // --- 新規作成 ---
  const handleCreate = async () => {
    if (!userId) {
      notify("作成にはサインインが必要です", "info");
      return;
    }
    const ttl = title.trim(),
      bdy = body.trim();
    if (!ttl || !bdy) {
      notify("タイトルと本文は必須です", "error");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-User-Id": userId },
        body: JSON.stringify({ title: ttl, body: bdy }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        notify(json?.error?.message ?? `作成に失敗 (HTTP ${res.status})`, "error");
        return;
      }
      notify("テンプレートを作成しました", "success");
      setCreateOpen(false);
      setTitle("");
      setBody("");
      await fetchList();
    } catch (e: any) {
      notify(e?.message ?? "作成時にエラー", "error");
    } finally {
      setCreating(false);
    }
  };

  // --- 編集開始 ---
  const onEditClick = (id: string) => {
    const found = items.find((x) => x.id === id);
    if (!found) {
      notify("編集対象が見つかりません", "error");
      return;
    }
    setEditId(found.id);
    setEditTitle(found.title ?? "");
    setEditBody(found.body ?? "");
    setEditOpen(true);
  };

  // --- 更新 ---
  const handleUpdate = async () => {
    if (!userId) {
      notify("更新にはサインインが必要です", "info");
      return;
    }
    const ttl = editTitle.trim(),
      bdy = editBody.trim();
    if (!ttl || !bdy) {
      notify("タイトルと本文は必須です", "error");
      return;
    }
    if (!editId) {
      notify("IDが不明のため更新不可", "error");
      return;
    }

    setUpdating(true);
    try {
      const res = await fetch(`/api/templates/${encodeURIComponent(editId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-User-Id": userId },
        body: JSON.stringify({ title: ttl, body: bdy }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        notify(json?.error?.message ?? `更新失敗 (HTTP ${res.status})`, "error");
        return;
      }
      notify("テンプレートを更新しました", "success");
      setEditOpen(false);
      setEditId("");
      setEditTitle("");
      setEditBody("");
      await fetchList();
    } catch (e: any) {
      notify(e?.message ?? "更新時にエラー", "error");
    } finally {
      setUpdating(false);
    }
  };

  // --- 削除 ---
  const onDeleteClick = (id: string) => {
    const found = items.find((x) => x.id === id);
    if (!found) {
      notify("削除対象が見つかりません", "error");
      return;
    }
    setDeleteTarget({ id: found.id, title: found.title ?? "(no title)" });
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!userId) {
      notify("削除にはサインインが必要です", "info");
      return;
    }
    if (!deleteTarget?.id) {
      notify("ID不明のため削除不可", "error");
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch(`/api/templates/${encodeURIComponent(deleteTarget.id)}`, {
        method: "DELETE",
        headers: { "X-User-Id": userId },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        notify(json?.error?.message ?? `削除失敗 (HTTP ${res.status})`, "error");
        return;
      }
      notify("テンプレートを削除しました", "success");
      setDeleteOpen(false);
      setDeleteTarget(null);
      await fetchList();
    } catch (e: any) {
      notify(e?.message ?? "削除時にエラー", "error");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* ここにUI内容（カード・テーブル・ダイアログ）は元のまま配置 */}
    </div>
  );
}

// ★★★ ページ直下で Suspense に包む（この位置が重要）
export default function TemplatesPage() {
  return (
    <React.Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading templates…</div>}>
      <TemplatesInner />
    </React.Suspense>
  );
}
