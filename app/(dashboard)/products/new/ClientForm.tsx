"use client";

// app/(dashboard)/products/new/ClientForm.tsx
// - 特徴・強み：textarea + 8文字以上（常時注意喚起 / 未達は送信ブロック）
// - 送信：POST /api/products（既存）
// - 成功：/products/[id] へ遷移（id取得できない場合は /products）

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type ApiOk = {
  id?: string;
  product?: { id?: string };
  data?: { id?: string };
  item?: { id?: string };
};

function pickId(v: unknown): string | null {
  if (!v || typeof v !== "object") return null;
  const o = v as ApiOk;

  const direct = typeof o.id === "string" ? o.id : null;
  const p = typeof o.product?.id === "string" ? o.product.id : null;
  const d = typeof o.data?.id === "string" ? o.data.id : null;
  const i = typeof o.item?.id === "string" ? o.item.id : null;

  return direct ?? p ?? d ?? i ?? null;
}

export function ClientForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [strengths, setStrengths] = useState("");
  const [memo, setMemo] = useState("");

  const [error, setError] = useState<string | null>(null);

  const strengthsLen = strengths.trim().length;

  const canSubmit = useMemo(() => {
    if (isPending) return false;
    if (name.trim().length === 0) return false;
    if (category.trim().length === 0) return false;
    if (strengthsLen < 8) return false;
    return true;
  }, [isPending, name, category, strengthsLen]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!canSubmit) return;

    const payload = {
      name: name.trim(),
      category: category.trim(),
      // 「特徴・強み」→ description として保存（最小で意味が通る）
      description: strengths.trim(),
      // 「補足メモ」→ factsNote として保存（任意）
      factsNote: memo.trim() ? memo.trim() : undefined,
    };

    startTransition(async () => {
      try {
        const res = await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        if (res.status === 403) {
          router.replace("/pricing");
          return;
        }

        let json: unknown = null;
        try {
          json = await res.json();
        } catch {
          // ignore
        }

        if (!res.ok) {
          if (res.status === 409) {
            setError("同じ名前の商品がすでに存在する可能性があります。商品名を少し変えてお試しください。");
            return;
          }
          const msg =
            (json && typeof json === "object" && "error" in (json as any) && typeof (json as any).error === "string"
              ? (json as any).error
              : null) ?? `作成に失敗しました（${res.status}）`;
          setError(msg);
          return;
        }

        const id = pickId(json);
        if (id) {
          router.push(`/products/${id}`);
          return;
        }

        // idが取れない場合でも、最小フローとして一覧へ戻す
        router.push("/products");
      } catch (err) {
        setError(err instanceof Error ? err.message : "作成に失敗しました（Unknown error）");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium">商品名（必須）</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例：軽量ステンレスボトル 500ml"
          autoComplete="off"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">用途（必須）</label>
        <Input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="例：アウトドア／通勤／ギフト など"
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground">
          ※ 商品の「分類・使いどころ」を、短い言葉でOKです。
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">特徴・強み（必須）</label>
        <Textarea
          value={strengths}
          onChange={(e) => setStrengths(e.target.value)}
          placeholder="例：保温力が高い／軽くて持ち運びやすい／洗いやすい など"
          rows={5}
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            8文字以上で入力してください（Writerの制約と同等です）
          </p>
          <p className="text-xs text-muted-foreground">{strengthsLen}/8</p>
        </div>

        {strengthsLen > 0 && strengthsLen < 8 && (
          <p className="text-xs text-red-600">
            あと {8 - strengthsLen} 文字で送信できます
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">補足メモ（任意）</label>
        <Textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="例：色はブラックが人気／同梱物：本体＋取説 など"
          rows={4}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={!canSubmit}>
          {isPending ? "作成中..." : "作成する"}
        </Button>

        <Button type="button" variant="secondary" onClick={() => router.push("/products")} disabled={isPending}>
          キャンセル
        </Button>
      </div>
    </form>
  );
}
