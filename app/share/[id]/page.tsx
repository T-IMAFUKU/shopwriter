"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

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
    // ここでは検証デモとしてトースト表示のみ
    toast.success("送信しました", {
      description: `文字数: ${data.desc.length} / ${max}`,
    });
    reset();
  };

  const hasError = !!errors.desc;

  return (
    <main className="p-6 space-y-6">
      <h1 className="text-xl font-bold">Textarea + バリデーション（RHF + Zod）</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-2">
        <Label htmlFor="desc">商品説明（必須）</Label>

        <Textarea
          id="desc"
          placeholder="商品の特徴・メリット・使用シーンなどを200文字以内で入力してください。"
          maxLength={max}
          aria-invalid={hasError}
          aria-describedby="desc-help desc-counter desc-error"
          className={hasError ? "border-destructive focus-visible:ring-destructive" : ""}
          {...register("desc")}
        />

        {/* ヘルプ */}
        <p id="desc-help" className="text-sm text-muted-foreground">
          10〜200文字。具体例や数値を含めると効果的です。
        </p>

        {/* エラー */}
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
