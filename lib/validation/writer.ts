import { z } from "zod";

// ✅ Zod Schema
export const WriterInputSchema = z.object({
  productName: z.string().min(1, "商品名は必須です"),
  audience: z.string().min(1, "想定読者は必須です"),
  template: z.string().min(1, "テンプレートは必須です"),
  tone: z.string().min(1, "トーンは必須です"),
  keywords: z.array(z.string()).min(1, "キーワードを1つ以上入力してください"),
  language: z.string().min(1, "言語は必須です"),
});

export type WriterInput = z.infer<typeof WriterInputSchema>;
