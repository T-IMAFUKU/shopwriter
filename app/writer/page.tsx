"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ✅ 型とSchemaは外部からimport
import { WriterInputSchema, WriterInput } from "@/lib/validation/writer";

export default function Page() {
  const [output, setOutput] = useState("");
  const [isPending, startTransition] = useTransition();

  const form = useForm<WriterInput>({
    resolver: zodResolver(WriterInputSchema),
    defaultValues: {
      productName: "",
      audience: "",
      template: "EC",
      tone: "カジュアル",
      keywords: [],   // 配列で初期化
      language: "ja", // 必須文字列
    },
  });

  const onSubmit = (values: WriterInput) => {
    startTransition(async () => {
      try {
        const resp = await fetch("/api/writer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        });

        if (!resp.ok) {
          toast.error("APIエラーが発生しました");
          return;
        }

        const data = await resp.json();
        setOutput(data.text || "");
        toast.success("生成が完了しました");
      } catch (err) {
        toast.error("通信エラーが発生しました");
      }
    });
  };

  return (
    <main className="container mx-auto max-w-3xl p-6 space-y-6">
      <h1 className="text-2xl font-bold">Writer</h1>

      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-4 border rounded-lg p-4"
      >
        <div>
          <Label htmlFor="productName">商品名</Label>
          <Input id="productName" {...form.register("productName")} />
        </div>

        <div>
          <Label htmlFor="audience">想定読者</Label>
          <Input id="audience" {...form.register("audience")} />
        </div>

        <div>
          <Label htmlFor="template">テンプレート</Label>
          <Input id="template" {...form.register("template")} />
        </div>

        <div>
          <Label htmlFor="tone">トーン</Label>
          <Input id="tone" {...form.register("tone")} />
        </div>

        <div>
          <Label htmlFor="keywords">キーワード（カンマ区切り）</Label>
          <Input
            id="keywords"
            onChange={(e) => {
              const arr = e.target.value
                .split(",")
                .map((k) => k.trim())
                .filter(Boolean);
              form.setValue("keywords", arr);
            }}
          />
        </div>

        <div>
          <Label htmlFor="language">言語</Label>
          <Input id="language" {...form.register("language")} />
        </div>

        <Button type="submit" disabled={isPending}>
          {isPending ? "生成中..." : "生成する"}
        </Button>
      </form>

      <Tabs defaultValue="output" className="w-full">
        <TabsList>
          <TabsTrigger value="output">出力</TabsTrigger>
        </TabsList>
        <TabsContent value="output">
          <Textarea
            className="min-h-[200px] w-full"
            value={output}
            readOnly
          />
        </TabsContent>
      </Tabs>
    </main>
  );
}
