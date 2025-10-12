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
    .min(10, "10譁・ｭ嶺ｻ･荳翫〒蜈･蜉帙＠縺ｦ縺上□縺輔＞")
    .max(200, "200譁・ｭ嶺ｻ･蜀・〒蜈･蜉帙＠縺ｦ縺上□縺輔＞"),
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
    // 縺薙％縺ｧ縺ｯ讀懆ｨｼ繝・Δ縺ｨ縺励※繝医・繧ｹ繝郁｡ｨ遉ｺ縺ｮ縺ｿ
    toast.success("騾∽ｿ｡縺励∪縺励◆", {
      description: `譁・ｭ玲焚: ${data.desc.length} / ${max}`,
    });
    reset();
  };

  const hasError = !!errors.desc;

  return (
    <main className="p-6 space-y-6">
      <h1 className="text-xl font-bold">Textarea + 繝舌Μ繝・・繧ｷ繝ｧ繝ｳ・・HF + Zod・・/h1>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-2">
        <Label htmlFor="desc">蝠・刀隱ｬ譏趣ｼ亥ｿ・茨ｼ・/Label>

        <Textarea
          id="desc"
          placeholder="蝠・刀縺ｮ迚ｹ蠕ｴ繝ｻ繝｡繝ｪ繝・ヨ繝ｻ菴ｿ逕ｨ繧ｷ繝ｼ繝ｳ縺ｪ縺ｩ繧・00譁・ｭ嶺ｻ･蜀・〒蜈･蜉帙＠縺ｦ縺上□縺輔＞縲・
          maxLength={max}
          aria-invalid={hasError}
          aria-describedby="desc-help desc-counter desc-error"
          className={hasError ? "border-destructive focus-visible:ring-destructive" : ""}
          {...register("desc")}
        />

        {/* 繝倥Ν繝・*/}
        <p id="desc-help" className="text-sm text-muted-foreground">
          10縲・00譁・ｭ励ょ・菴謎ｾ九ｄ謨ｰ蛟､繧貞性繧√ｋ縺ｨ蜉ｹ譫懃噪縺ｧ縺吶・        </p>

        {/* 繧ｨ繝ｩ繝ｼ */}
        {hasError && (
          <p id="desc-error" className="text-sm text-destructive">
            {errors.desc?.message}
          </p>
        )}

        {/* 繧ｫ繧ｦ繝ｳ繧ｿ */}
        <p id="desc-counter" className="text-xs text-muted-foreground text-right">
          {value.length} / {max}
        </p>

        <div className="pt-2">
          <Button type="submit" disabled={!isValid || isSubmitting}>
            {isSubmitting ? "騾∽ｿ｡荳ｭ..." : "騾∽ｿ｡"}
          </Button>
        </div>
      </form>
    </main>
  );
}

