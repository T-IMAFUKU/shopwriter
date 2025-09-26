// lib/validation/writer.ts
import { z } from "zod";

/**
 * 過去に合意した writer 入力の最小スキーマ（復元版）
 * - productName / audience / template / tone / language: 1文字以上
 * - keywords: 1件以上の文字列配列
 */
export const writerSchema = z.object({
  productName: z
    .string()
    .min(1, "商品名は必須です（1文字以上を入力してください）"),
  audience: z
    .string()
    .min(1, "想定読者は必須です（1文字以上を入力してください）"),
  template: z
    .string()
    .min(1, "テンプレートは必須です（1文字以上を入力してください）"),
  tone: z
    .string()
    .min(1, "トーンは必須です（1文字以上を入力してください）"),
  keywords: z
    .array(z.string().min(1, "空のキーワードは指定できません"))
    .min(1, "キーワードは1件以上必須です"),
  language: z
    .string()
    .min(1, "言語は必須です（1文字以上を入力してください）"),
});

export type WriterInput = z.infer<typeof writerSchema>;

/**
 * バリデーションヘルパ（呼び出し側で safeParse を使う場合は任意）
 */
export function validateWriter(input: unknown) {
  return writerSchema.safeParse(input);
}
