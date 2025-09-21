import { z } from "zod";

// 笨・Zod Schema
export const WriterInputSchema = z.object({
  productName: z.string().min(1, "蝠・刀蜷阪・蠢・医〒縺・),
  audience: z.string().min(1, "諠ｳ螳夊ｪｭ閠・・蠢・医〒縺・),
  template: z.string().min(1, "繝・Φ繝励Ξ繝ｼ繝医・蠢・医〒縺・),
  tone: z.string().min(1, "繝医・繝ｳ縺ｯ蠢・医〒縺・),
  keywords: z.array(z.string()).min(1, "繧ｭ繝ｼ繝ｯ繝ｼ繝峨ｒ1縺､莉･荳雁・蜉帙＠縺ｦ縺上□縺輔＞"),
  language: z.string().min(1, "險隱槭・蠢・医〒縺・),
});

export type WriterInput = z.infer<typeof WriterInputSchema>;
