// lib/validation/share.ts
// 逶ｮ逧・ｼ壹∪縺夐°逕ｨ繧帝壹☆・郁誠縺｡縺ｪ縺БPI・峨・B縺ｫ荳榊ｮ悟・繝・・繧ｿ縺梧ｷｷ縺倥▲縺ｦ縺・※繧・00縺ｧ關ｽ縺｡縺ｪ縺・圻螳壼･醍ｴ・・
// 蠕後〒DB繧呈紛縺医◆繧峨｛ptional繧貞､悶＠縺ｦ蜴ｳ譬ｼ蛹悶↓謌ｻ縺励∪縺吶・

import { z } from "zod";

/** 蜈ｱ譛迂D・亥ｽ馴擇縺ｯ譛菴・譁・ｭ励〒險ｱ螳ｹ縲ょｾ後〒>=10縺ｸ謌ｻ縺呻ｼ・*/
export const ShareId = z.string().min(1);

/** 荳隕ｧ繧ｯ繧ｨ繝ｪ・・limit=&before=・・*/
export const ListSharesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  before: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().optional()
  ),
});
export type ListSharesQuery = z.infer<typeof ListSharesQuery>;

/** Share譛ｬ菴難ｼ・itle/content 縺ｯ荳譎ら噪縺ｫ optional・・*/
export const Share = z.object({
  id: ShareId,
  userId: z.string().optional(),          // 竊・荳譎ら噪縺ｫoptional・・B謠ｺ繧悟ｯｾ遲厄ｼ・
  title: z.string().min(1).optional(),    // 竊・荳譎ら噪縺ｫoptional
  content: z.string().optional(),         // 竊・荳譎ら噪縺ｫoptional
  isPublic: z.boolean().default(false),
  // Date | string | null/undefined 繧・ISO 譁・ｭ怜・縺ｸ豁｣隕丞喧
  createdAt: z
    .union([z.string(), z.date()])
    .transform((v) => (v instanceof Date ? v.toISOString() : v)),
});
export type Share = z.infer<typeof Share>;

/** 荳隕ｧ繝ｬ繧ｹ繝昴Φ繧ｹ・亥･醍ｴ・ｼ・*/
export const ShareListResponse = z.object({
  items: z.array(Share),
  next: z.string().nullable().optional(),
});
export type ShareListResponse = z.infer<typeof ShareListResponse>;

/** 繧ｨ繝ｩ繝ｼ繝輔か繝ｼ繝槭ャ繝・*/
export const ApiError = z.object({ error: z.string() });
export type ApiError = z.infer<typeof ApiError>;
