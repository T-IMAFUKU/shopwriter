// @ts-nocheck
"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { notify } from "@/lib/notify"; // notify.ts 経由（sonner直 import 禁止）

// shadcn/ui
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/* ========================
   型定義（API契約に合わせた最小集合）
   ======================== */
type TemplateItem = {
  id: string;
  title?: string | null;
  body?: string | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

type TemplatesGetOk = { ok: true; data: TemplateItem[]; ver?: string };
type TemplatesGetErr = {
  ok: false;
  error: { name: string; kind?: string; code?: string; message: string };
  ver?: string;
};
type TemplatePostOk = { ok: true; data: TemplateItem; ver?: string };
type TemplatePostErr = {
  ok: false;
  error: { name: string; kind?: string; code?: string; message: string };
  ver?: string;
};

// type guards
function isGetOk(x: unknown): x is TemplatesGetOk {
  return !!x && typeof x === "object" && (x as any).ok === true && Array.isArray((x as any).data);
}
function isGetErr(x: unknown): x is TemplatesGetErr {
  return !!x && typeof x === "object" && (x as any).ok === false && "error" in (x as any);
}
function isPostOk(x: unknown): x is TemplatePostOk {
  return !!x && typeof x === "object" && (x as any).ok === true && "data" in (x as any);
}
function isPostErr(x: unknown): x is TemplatePostErr {
  return !!x && typeof x === "object" && (x as any).ok === false && "error" in (x as any);
}

/* ============ util ============ */
function fmt(d?: string | Date | null) {
  if (!d) return "-";
  try {
    const dd = typeof d === "string" ? new Date(d) : d;
    if (Number.isNaN(dd.getTime())) return "-";
    return new Intl.DateTimeFormat("ja-JP", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(dd);
  } catch {
    return "-";
  }
}

/* ============ 画面 ============ */
export default function TemplatesPageBackup() {
  const router = useRouter();

  // 検索・ロード・一覧
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<TemplateItem[]>([]);
  const [ver, setVer] = useState<string | undefined>(undefined);

  // Dialog（新規作成）
  const [open, setOpen] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formBody, setFormBody] = useState("");
  const [saving, setSaving] = useState(false);

  // 一覧取得
  const fetchTemplates = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/templates", {
        method: "GET",
        cache: "no-store", // client fetch 型エラー防止（next: {...} は付けない）
      });
      const j: unknown = await res.json();
      if (isGetOk(j)) {
        setItems(j.data ?? []);
        setVer(j.ver);
      } else if (isGetErr(j)) {
        notify(`一覧取得失敗: ${j.error.message}`, "error");
      } else {
        notify("一覧取得失敗: 予期しないレスポンス形式です", "error");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      notify(`ネットワークエラー: ${msg}`, "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // フィルタ
  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return items;
    return items.filter((it) => {
      const t = `${it.title ?? ""} ${it.body ?? ""}`.toLowerCase();
      return t.includes(qq);
    });
  }, [q, items]);

  // 作成
  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const title = formTitle.trim();
      const body = formBody.trim();
      if (!title || !body) {
        notify("タイトルと本文は必須です。", "error");
        setSaving(false);
        return;
      }

      const res = await fetch("/api/templates", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body }),
      });

      let j: unknown = null;
      try {
        j = (await res.json()) as TemplatePostOk | TemplatePostErr;
      } catch {
        // JSONでなければ後段でHTTPコードを通知
      }

      if (res.ok && isPostOk(j)) {
        notify("テンプレートを作成しました", "success");
        setOpen(false);
        setFormTitle("");
        setFormBody("");
        router.refresh();
        await fetchTemplates();
      } else if (isPostErr(j)) {
        notify(`作成失敗: ${j.error.message}`, "error");
      } else {
        notify(`作成失敗: HTTP ${res.status}`, "error");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      notify(`エラー: ${msg}`, "error");
    } finally {
      setSaving(false);
    }
  }

  /* ========== UI ========== */
  return (
    <div className="isolate relative z-0 mx-auto w-full max-w-5xl p-4 md:p-8 space-y-6 bg-destructive text-destructive-foreground hover:bg-destructive/90">
      <Card className="relative z-0 bg-card shadow-sm bg-destructive text-destructive-foreground hover:bg-destructive/90">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 bg-destructive text-destructive-foreground hover:bg-destructive/90">
          <div>
            <CardTitle className="text-xl bg-destructive text-destructive-foreground hover:bg-destructive/90">テンプレート管理（Backup）</CardTitle>
            <div className="mt-1 text-sm text-muted-foreground bg-destructive text-destructive-foreground hover:bg-destructive/90">
              CRUD・選択UI。新規作成ダイアログを試験実装。
            </div>
          </div>

          <div className="flex items-center gap-2 bg-destructive text-destructive-foreground hover:bg-destructive/90">
            {ver ? <Badge variant="secondary">API ver: {ver}</Badge> : null}

            <Dialog
              open={open}
              onOpenChange={(v: boolean) => {
                setOpen(v);
                if (v) {
                  setFormTitle("");
                  setFormBody("");
                }
              }}
            >
              <DialogTrigger asChild>
                <Button variant="primary" className="rounded-2xl bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  新規テンプレート
                </Button>
              </DialogTrigger>

              <DialogContent className="z-[100] bg-destructive text-destructive-foreground hover:bg-destructive/90">
                <DialogHeader>
                  <DialogTitle>新規テンプレート作成</DialogTitle>
                  <DialogDescription>
                    タイトルと<strong>本文</strong>（body）を入力して「作成」を押してください。
                  </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleCreate} className="space-y-4 bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  <div className="space-y-2 bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    <Label htmlFor="title">タイトル</Label>
                    <Input
                      id="title"
                      value={formTitle}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setFormTitle(e.target.value)
                      }
                      placeholder="タイトルを入力"
                      required
                    />
                  </div>

                  <div className="space-y-2 bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    <Label htmlFor="body">本文（body）</Label>
                    <Textarea
                      id="body"
                      value={formBody}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                        setFormBody(e.target.value)
                      }
                      placeholder="本文（テンプレート本体）を入力"
                      required
                    />
                  </div>

                  <DialogFooter>
                    <Button type="submit" disabled={saving}>
                      {saving ? "保存中..." : "作成"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 bg-destructive text-destructive-foreground hover:bg-destructive/90">
          <div className="flex items-center gap-2 bg-destructive text-destructive-foreground hover:bg-destructive/90">
            <Input
              value={q}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
              placeholder="検索（タイトル・本文）"
              className="max-w-sm bg-destructive text-destructive-foreground hover:bg-destructive/90"
            />
            <Button
              variant="secondary"
              onClick={() => {
                setQ("");
                router.refresh();
              }}
            >
              クリア
            </Button>
          </div>

          <div className="relative z-0 overflow-hidden rounded-2xl border bg-background bg-destructive text-destructive-foreground hover:bg-destructive/90">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  <TableHead className="w-[48px] bg-destructive text-destructive-foreground hover:bg-destructive/90">#</TableHead>
                  <TableHead>タイトル</TableHead>
                  <TableHead>本文（抜粋）</TableHead>
                  <TableHead>更新</TableHead>
                  <TableHead className="w-[200px] text-right bg-destructive text-destructive-foreground hover:bg-destructive/90">操作</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {loading ? (
                  <TableRow className="bg-background bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    <TableCell colSpan={5} className="text-center py-10 bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      取得中…
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow className="bg-background bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    <TableCell
                      colSpan={5}
                      className="text-center py-10 text-muted-foreground bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      テンプレートがありません（または該当なし）
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((it, idx) => (
                    <TableRow
                      key={it.id}
                      className="bg-background even:bg-muted/40 hover:bg-muted/60 transition-colors bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      <TableCell className="font-mono text-xs text-muted-foreground bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        {String(idx + 1).padStart(2, "0")}
                      </TableCell>

                      <TableCell>
                        <div className="font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90">{it.title ?? "(無題)"}</div>
                      </TableCell>

                      <TableCell className="text-sm text-muted-foreground bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        {(it.body ?? "-").slice(0, 80)}
                        {(it.body?.length ?? 0) > 80 ? "…" : ""}
                      </TableCell>

                      <TableCell className="text-sm bg-destructive text-destructive-foreground hover:bg-destructive/90">{fmt(it.updatedAt)}</TableCell>

                      <TableCell className="text-right bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        <div className="inline-flex gap-2 bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          <Button size="sm" variant="secondary" disabled>
                            編集
                          </Button>
                          <Button size="sm" variant="primary" disabled>
                            削除
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

