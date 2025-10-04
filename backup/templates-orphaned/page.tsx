"use client";

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

// --- UIイベントを EventLog にPOSTする最小関数（クライアント用） ---
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
  } catch {
    // 計測はUX阻害しないため、通信失敗は握りつぶす
  }
}

type TemplateItem = {
  id: string;
  title: string;
  body?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
};

export default function TemplatesPage() {
  const { data: session } = useSession();

  // NextAuth の Session.user に id が無い型構成に備えて安全に抽出
  const userId =
    session?.user && "id" in session.user ? String((session.user as any).id) : undefined;

  const [items, setItems] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [creating, setCreating] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string>("");
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
      notify("作成にはサインインが必要です（devでは session.user.id を使用）", "info");
      return;
    }
    const ttl = title.trim();
    const bdy = body.trim();
    if (!ttl || !bdy) {
      notify("タイトルと本文は必須です", "error");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": userId,
        },
        body: JSON.stringify({ title: ttl, body: bdy }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        const msg = json?.error?.message ?? `作成に失敗しました（HTTP ${res.status}）`;
        notify(msg, "error");
        return;
      }

      notify("テンプレートを作成しました", "success");
      setCreateOpen(false);
      setTitle("");
      setBody("");
      await fetchList();
    } catch (e: any) {
      notify(e?.message ?? "作成時にエラーが発生しました", "error");
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
      notify("更新にはサインインが必要です（devでは session.user.id を使用）", "info");
      return;
    }
    const ttl = editTitle.trim();
    const bdy = editBody.trim();
    if (!ttl || !bdy) {
      notify("タイトルと本文は必須です", "error");
      return;
    }
    if (!editId) {
      notify("IDが不明のため更新できません", "error");
      return;
    }

    setUpdating(true);
    try {
      const res = await fetch(`/api/templates/${encodeURIComponent(editId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": userId,
        },
        body: JSON.stringify({ title: ttl, body: bdy }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        const msg = json?.error?.message ?? `更新に失敗しました（HTTP ${res.status}）`;
        notify(msg, "error");
        return;
      }

      notify("テンプレートを更新しました", "success");
      setEditOpen(false);
      setEditId("");
      setEditTitle("");
      setEditBody("");
      await fetchList();
    } catch (e: any) {
      notify(e?.message ?? "更新時にエラーが発生しました", "error");
    } finally {
      setUpdating(false);
    }
  };

  // --- 削除開始 ---
  const onDeleteClick = (id: string) => {
    const found = items.find((x) => x.id === id);
    if (!found) {
      notify("削除対象が見つかりません", "error");
      return;
    }
    setDeleteTarget({ id: found.id, title: found.title ?? "(no title)" });
    setDeleteOpen(true);
  };

  // --- 削除 ---
  const handleDelete = async () => {
    if (!userId) {
      notify("削除にはサインインが必要です（devでは session.user.id を使用）", "info");
      return;
    }
    if (!deleteTarget?.id) {
      notify("IDが不明のため削除できません", "error");
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
        const msg = json?.error?.message ?? `削除に失敗しました（HTTP ${res.status}）`;
        notify(msg, "error");
        return;
      }

      notify("テンプレートを削除しました", "success");
      setDeleteOpen(false);
      setDeleteTarget(null);
      await fetchList();
    } catch (e: any) {
      notify(e?.message ?? "削除時にエラーが発生しました", "error");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">テンプレート</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void fetchList()}>
              <RotateCw className="mr-1 h-4 w-4" />
              更新
            </Button>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-1 h-4 w-4" />
                  新規作成
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>新規テンプレート</DialogTitle>
                  <DialogDescription>タイトルと本文を入力してください。</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-title">タイトル</Label>
                    <Input
                      id="new-title"
                      placeholder="タイトル"
                      value={title}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-body">本文</Label>
                    <Textarea
                      id="new-body"
                      placeholder="本文"
                      rows={6}
                      value={body}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setBody(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="secondary">キャンセル</Button>
                  </DialogClose>
                  <Button type="button" onClick={() => void handleCreate()} disabled={creating}>
                    作成
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>

        <CardContent>
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>タイトル</TableHead>
                <TableHead>更新日</TableHead>
                <TableHead className="w-[1%]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-sm text-muted-foreground">
                    読み込み中…
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-sm text-muted-foreground">
                    テンプレートがありません
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link href={`/app/templates/${r.id}`} className="underline underline-offset-4">
                        {r.title}
                      </Link>
                    </TableCell>
                    <TableCell>{r.updatedAt}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="secondary" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>操作</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => onEditClick(r.id)}>編集</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive" onClick={() => onDeleteClick(r.id)}>
                            削除
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 編集ダイアログ */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>テンプレートを編集</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">タイトル</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-body">本文</Label>
              <Textarea
                id="edit-body"
                rows={6}
                value={editBody}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditBody(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">キャンセル</Button>
            </DialogClose>
            <Button type="button" onClick={() => void handleUpdate()} disabled={updating}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 削除ダイアログ */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>テンプレートを削除</DialogTitle>
            <DialogDescription>この操作は取り消せません。</DialogDescription>
          </DialogHeader>
          <p className="text-sm">
            削除対象：<span className="font-medium">{deleteTarget?.title ?? "-"}</span>
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">キャンセル</Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={deleting}
            >
              削除する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
