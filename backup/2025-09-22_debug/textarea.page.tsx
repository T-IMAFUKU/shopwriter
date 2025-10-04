"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

// ★ backup 配下はエイリアス解決が不安定なため相対パスに統一
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Button } from "../../components/ui/button";

// ★ sonner 直呼び出しは禁止。通知は notify 経由に統一
import { notifySuccess, notifyError } from "../../src/lib/notify";

// バリデーション
const schema = z.object({
  desc: z
    .string()
    .trim()
    .min(10, "10文字以上で入力してください")
    .max(200, "200文字以内で入力してください"),
});

type FormValues = z.infer<typeof schema>;

export default function Page() {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isValid, isSubmitting },
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: { desc: "" },
  });

  const value = watch("desc") ?? "";
  const max = 200;

  const onSubmit = async (data: FormValues) => {
    try {
      // 送信成功 → 成功（緑・2.6s）
      notifySuccess("送信しました", {
        description: `文字数: ${data.desc.length} / ${max}`,
      });
      reset();
    } catch (e) {
      // 万一のエラー → 失敗（赤・4.0s）
      notifyError("送信中にエラーが発生しました");
    }
  };

  const hasError = !!errors.desc;

  return (
    <main className="p-6 space-y-6">
      <h1 className="text-xl font-bold">Textarea + React Hook Form + Zod（デバッグ）</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-2">
        <Label htmlFor="desc">説明</Label>

        <Textarea
          id="desc"
          placeholder="説明文を入力してください（10〜200文字）"
          maxLength={max}
          aria-invalid={hasError}
          aria-describedby="desc-help desc-counter desc-error"
          className={hasError ? "border-destructive focus-visible:ring-destructive" : ""}
          {...register("desc")}
        />

        {/* ヘルプ */}
        <p id="desc-help" className="text-sm text-muted-foreground">
          入力は 10〜200 文字の範囲でお願いします。要点を簡潔に記述してください。
        </p>

        {/* エラー表示 */}
        {hasError && (
          <p id="desc-error" className="text-sm text-destructive">
            {errors.desc?.message}
          </p>
        )}

        {/* カウンタ */}
        <p id="desc-counter" className="text-xs text-muted-foreground text-right">
          {value.length} / {max}
        </p>

        <div className="pt-2">
          <Button type="submit" disabled={!isValid || isSubmitting}>
            {isSubmitting ? "送信中..." : "送信"}
          </Button>
        </div>
      </form>
    </main>
  );
}
