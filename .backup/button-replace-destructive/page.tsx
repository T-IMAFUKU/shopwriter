// FULL BASED ON: app/(dashboard)/dashboard/templates/page.tsx
"use client"; // ← 必ず最上行

// cspell:ignore ellipsize
// 【CP@2025-09-21.v3】適用：検索クエリ依存のため静的化を禁止
export const dynamic = 'force-dynamic';

import * as React from "react";
import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useSession, signIn } from "next-auth/react";

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

// --- Recharts（グラフ） ---
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
} from "recharts";

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
      credentials: "same-origin",
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

function TemplatesInner() {
  const { data: session, status } = useSession();

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
      const headers: Record<string, string> = {};
      if (userId) headers["X-User-Id"] = userId;
      const res = await fetch("/api/templates", {
        method: "GET",
        headers,
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const t = await res.text();
          if (t) msg += ` — ${t.slice(0, 120)}`;
        } catch {}
        throw new Error(msg);
      }
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
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // 未サインイン時は fetch しない
  useEffect(() => {
    if (session?.user) {
      void fetchList();
    } else {
      setItems([]);
      setLoading(false);
      setError(null);
    }
  }, [fetchList, session]);

  const rows = useMemo(
    () =>
      items.map((t, idx) => ({
        idx,
        id: t.id,
        title: t.title || "(no title)",
        updatedAt: t.updatedAt ? new Date(t.updatedAt).toLocaleString() : "-",
      })),
    [items]
  );

  /** タイトル省略（X軸・ラベル用） */
  const ellipsize = useCallback((s: string, max = 10) => {
    const str = s || "無題";
    return str.length > max ? str.slice(0, max) + "…" : str;
  }, []);

  // --- グラフデータ（上位5件）+ 見た目用フィールド ---
  const chartData = useMemo(() => {
    const sliced = rows.slice(0, 5);
    return sliced.map((r) => ({
      id: r.id,
      name: ellipsize(r.title, 8),
      fullTitle: r.title,
      length: r.title.length,
    }));
  }, [rows, ellipsize]);

  const maxY = useMemo(() => {
    const m = chartData.reduce((acc, d) => Math.max(acc, d.length), 0);
    return Number.isFinite(m) ? m : 0;
  }, [chartData]);

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
        credentials: "same-origin",
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
        credentials: "same-origin",
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
        credentials: "same-origin",
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

  const onSelectTemplate = async (id: string, title: string) => {
    notify(`選択: ${title}`, "success");
    await logEventUI("ui", "template.select", "INFO", { id, title }, userId);
  };

  // 未サインイン時：サインイン案内カード
  if (status !== "loading" && !session?.user) {
    const cb = "/dashboard/templates";
    return (
      <main className="container mx-auto py-8">
        <Card className="max-w-xl rounded-xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">サインインが必要です</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              テンプレートの取得・作成・編集・削除、および簡易グラフの表示にはサインインが必要です。
            </p>
            <div className="flex gap-2">
              <Button onClick={() => signIn("github", { callbackUrl: cb })}>GitHubでサインイン</Button>
              <Button variant="secondary" asChild>
                <Link href={`/api/auth/signin?callbackUrl=${encodeURIComponent(cb)}`}>サインイン画面を開く</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  // ---- グラフ Tooltip（カスタム） ----
  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const p = payload[0]?.payload;
    return (
      <div className="rounded-md border bg-popover text-popover-foreground shadow p-2 text-xs">
        <div className="font-medium">{p?.fullTitle ?? "-"}</div>
        <div className="text-muted-foreground">文字数: {p?.length ?? "-"}</div>
      </div>
    );
  };

  // ▼▼ UIトークン基準ラッパ：container / セクション余白 / カード角丸・影・内側余白 ▼▼
  return (
    <main className="container mx-auto py-8 space-y-8">
      {/* ヘッダー */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">テンプレート</h1>
            <p className="text-sm text-muted-foreground">
              作成／編集／削除と、簡易グラフ（タイトル文字数）で概観を確認できます。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => fetchList()}>
              <RotateCw className="h-4 w-4 mr-1" />
              再読み込み
            </Button>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" disabled={!session?.user}>
                  <Plus className="h-4 w-4 mr-1" />
                  新規作成
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>テンプレートを新規作成</DialogTitle>
                  <DialogDescription>タイトルと本文を入力してください。</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-title">タイトル</Label>
                    <Input id="new-title" value={title} onChange={(e) => setTitle(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-body">本文</Label>
                    <Textarea id="new-body" rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
                  </div>
                </div>
                <DialogFooter className="gap-2">
                  <DialogClose asChild>
                    <Button type="button" variant="secondary">キャンセル</Button>
                  </DialogClose>
                  <Button onClick={handleCreate} disabled={creating}>
                    {creating ? "作成中…" : "作成する"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </section>

      {/* グリッド：左=表、右=グラフ */}
      <section className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-10">
        {/* 左：一覧カード */}
        <Card className="overflow-hidden rounded-xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">テンプレート一覧</CardTitle>
          </CardHeader>
          <CardContent className="p-8">
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading templates…</div>
            ) : error ? (
              <div className="text-sm text-red-600">Error: {error}</div>
            ) : items.length === 0 ? (
              <div className="text-sm text-muted-foreground">データがありません</div>
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[56px]">#</TableHead>
                      <TableHead>タイトル</TableHead>
                      <TableHead className="w-[180px]">更新日時</TableHead>
                      <TableHead className="w-[64px] text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-muted-foreground">{r.idx + 1}</TableCell>
                        <TableCell className="font-medium">
                          <button
                            className="text-left underline-offset-2 hover:underline"
                            onClick={() => onSelectTemplate(r.id, r.title)}
                          >
                            {r.title}
                          </button>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.updatedAt}</TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>操作</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => onEditClick(r.id)}>編集</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onDeleteClick(r.id)} className="text-red-600">
                                削除
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 右：棒グラフカード */}
        <Card className="overflow-hidden rounded-xl shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">簡易グラフ（タイトル文字数／上位5件）</CardTitle>
          </CardHeader>
          <CardContent className="p-8 h-[300px]">
            {items.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                データがありません（グラフ表示対象なし）
              </div>
            ) : (
              <div
                className="h-full"
                role="img"
                aria-label="テンプレートタイトルの文字数棒グラフ（上位5件）"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted-foreground))" opacity={0.2} />
                    <XAxis
                      dataKey="name"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={6}
                    />
                    <YAxis
                      allowDecimals={false}
                      domain={[0, maxY + 1]}
                      tickCount={Math.min(6, Math.max(3, maxY + 1))}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar
                      dataKey="length"
                      fill="hsl(var(--primary))"
                      fillOpacity={0.85}
                      radius={[6, 6, 0, 0]}
                      isAnimationActive
                      animationDuration={400}
                      aria-label="タイトル文字数"
                    >
                      <LabelList
                        dataKey="length"
                        position="top"
                        offset={8}
                        className="fill-foreground text-[10px]"
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* 編集ダイアログ */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>テンプレートを編集</DialogTitle>
            <DialogDescription>ID: {editId || "-"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">タイトル</Label>
              <Input id="edit-title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-body">本文</Label>
              <Textarea id="edit-body" rows={6} value={editBody} onChange={(e) => setEditBody(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button type="button" variant="secondary">キャンセル</Button>
            </DialogClose>
            <Button onClick={handleUpdate} disabled={updating}>
              {updating ? "更新中…" : "更新する"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 削除ダイアログ */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>削除の確認</DialogTitle>
            <DialogDescription>
              「{deleteTarget?.title ?? "-"}」を削除します。元に戻せません。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button type="button" variant="secondary">キャンセル</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "削除中…" : "削除する"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
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

