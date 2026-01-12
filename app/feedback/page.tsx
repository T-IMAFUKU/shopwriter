"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Category = "不具合" | "不明点" | "要望" | "その他";

/**
 * フィードバック宛先メール
 * Innovista Inc. 運用窓口
 */
const SUPPORT_EMAIL = "innovista.grp@gmail.com";

function buildMailto(params: {
  category: Category;
  email: string;
  subject: string;
  message: string;
  pageUrl: string;
  ua: string;
}): string {
  const lines: string[] = [
    "【カテゴリ】",
    params.category,
    "",
    "【返信先メール】",
    params.email || "(未入力)",
    "",
    "【件名】",
    params.subject || "(未入力)",
    "",
    "【内容】",
    params.message || "(未入力)",
    "",
    "【参考情報】",
    `ページ: ${params.pageUrl}`,
    `UA: ${params.ua}`,
    "",
    "（このまま送信してください）",
  ];

  const subject = `[ShopWriter] ${params.category}：${params.subject || "お問い合わせ"}`;
  const body = lines.join("\n");

  return `mailto:${encodeURIComponent(SUPPORT_EMAIL)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export default function FeedbackPage() {
  const [category, setCategory] = React.useState<Category>("不明点");
  const [email, setEmail] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [message, setMessage] = React.useState("");

  const pageUrl =
    typeof window !== "undefined" ? window.location.href : "https://shopwriter-next.vercel.app/feedback";
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";

  const canSend = message.trim().length >= 10;

  const onCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      toast.success("送信先メールアドレスをコピーしました");
    } catch {
      toast.error("コピーに失敗しました（ブラウザ権限をご確認ください）");
    }
  };

  const onOpenMail = () => {
    if (!canSend) {
      toast.error("内容は10文字以上で入力してください");
      return;
    }
    const mailto = buildMailto({ category, email, subject, message, pageUrl, ua });
    window.location.href = mailto;
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <div className="mb-6 space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">フィードバック / お問い合わせ</h1>
        <p className="text-sm text-muted-foreground">
          不安・質問・不具合・要望など、気軽に送ってください。返信が必要な場合はメールアドレスを入力してください。
        </p>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link href="/guide" className="underline underline-offset-4 text-muted-foreground hover:text-foreground">
            利用ガイドへ戻る
          </Link>
          <span className="text-muted-foreground">/</span>
          <Link href="/faq" className="underline underline-offset-4 text-muted-foreground hover:text-foreground">
            FAQへ戻る
          </Link>
        </div>
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base">送信内容</CardTitle>
          <CardDescription>送信ボタンでメールアプリが開きます（内容は自動で整形されます）。</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">カテゴリ</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="不具合">不具合</option>
              <option value="不明点">不明点</option>
              <option value="要望">要望</option>
              <option value="その他">その他</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">返信先メール（任意）</label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="例：yourname@example.com（返信が必要な場合のみ）"
              inputMode="email"
              autoComplete="email"
            />
            <p className="text-xs text-muted-foreground">※ 未入力でも送信できます（返信できません）</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">件名（任意）</label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="例：共有がうまくいかない / 表示が崩れる など"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">内容（必須・10文字以上）</label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="min-h-[160px]"
              placeholder={
                "例：\n・何をしようとして\n・何が起きて\n・どこで困っているか\n（スクショがある場合は、文面に「スクショあり」と書いてください）"
              }
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>送信時にページURLとUA（端末情報）を自動添付</span>
              <span>{message.trim().length}/10</span>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={onCopyEmail}>
                送信先メールをコピー
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCategory("不明点");
                  setEmail("");
                  setSubject("");
                  setMessage("");
                  toast.message("入力内容をリセットしました");
                }}
              >
                リセット
              </Button>
            </div>

            <Button type="button" onClick={onOpenMail} disabled={!canSend}>
              送信（メールを開く）
            </Button>
          </div>

          <div className="rounded-xl border bg-muted/30 p-4 text-sm">
            <p className="font-medium">送信できない場合</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>端末にメールアプリが未設定の場合、送信できないことがあります。</li>
              <li>その場合は「送信先メールをコピー」→ ご自身のメールから送信してください。</li>
              <li>
                宛先：<span className="font-mono text-foreground">{SUPPORT_EMAIL}</span>
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
