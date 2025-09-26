// lib/contracts/share.contract.ts
// SSOT: /api/shares 邉ｻ縺ｮ蜈･蜃ｺ蜉帛･醍ｴ・ｼ・od・・
// Prisma schema 縺ｫ螳悟・謨ｴ蜷茨ｼ・odel Share: id/title/body?/isPublic/ownerId?/createdAt/updatedAt・・

import { z } from "zod";

/** ISO 8601・医が繝輔そ繝・ヨ蠢・茨ｼ画枚蟄怜・縺ｸ蜑榊・逅・〒豁｣隕丞喧 */
export const IsoDateString = z.preprocess((v) => {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") return v;
  return v;
}, z.string().datetime({ offset: true }));

/** Share ID・・uid/uuid/莉ｻ諢乗枚蟄怜・繧呈圻螳夊ｨｱ螳ｹ・・*/
export const ShareId = z.string().min(1, "id is required");

/** Create 蜈･蜉幢ｼ・wnerId 縺ｯ繧ｵ繝ｼ繝先ｱｺ螳壹（sPublic 縺ｯ譛ｪ謖・ｮ壹↑繧・false 驕狗畑繧呈Φ螳夲ｼ・*/
export const ShareCreateInput = z.object({
  title: z.string().min(1).max(120),
  body: z.string().max(100000).optional(),
  isPublic: z.boolean().optional(), // 螳溯｣・・縺ｧ譛ｪ謖・ｮ壽凾 false 譌｢螳壹↓縺吶ｋ
});
export type ShareCreateInput = z.infer<typeof ShareCreateInput>;

/** Update 蜈･蜉幢ｼ医＞縺壹ｌ縺句ｿ・茨ｼ・*/
export const ShareUpdateInput = z
  .object({
    title: z.string().min(1).max(120).optional(),
    body: z.string().max(100000).optional(),
    isPublic: z.boolean().optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, {
    message: "at least one field is required",
  });
export type ShareUpdateInput = z.infer<typeof ShareUpdateInput>;

/** DB 逕ｱ譚･繧ｨ繝ｳ繝・ぅ繝・ぅ・・risma Share 縺ｫ謨ｴ蜷茨ｼ・*/
export const ShareEntity = z
  .object({
    id: ShareId,
    title: z.string().min(1),
    body: z.string().nullable().optional(), // Prisma: String?・・ull or undefined・・
    isPublic: z.boolean(),
    ownerId: z.string().optional().nullable(), // Prisma: String?
    createdAt: IsoDateString,
    updatedAt: IsoDateString,
  })
  .passthrough();
export type ShareEntity = z.infer<typeof ShareEntity>;

/** 荳隕ｧ逕ｨ縺ｮ霆ｽ驥城・岼・・I 讓呎ｺ冶｡ｨ遉ｺ・・*/
export const ShareListItem = ShareEntity.pick({
  id: true,
  title: true,
  isPublic: true,
  createdAt: true,
}).passthrough();
export type ShareListItem = z.infer<typeof ShareListItem>;

/** 繧ｯ繧ｨ繝ｪ・壹・繝ｼ繧ｸ繝阪・繧ｷ繝ｧ繝ｳ・・imit/before・・*/
export const ShareListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  before: z.string().optional(), // 繧ｫ繝ｼ繧ｽ繝ｫ・壼ｮ溯｣・・縺ｧ隗｣驥茨ｼ・d/createdAt 遲会ｼ・
});
export type ShareListQuery = z.infer<typeof ShareListQuery>;

/** 繝ｬ繧ｹ繝昴Φ繧ｹ・壹・繝ｼ繧ｸ繝阪・繧ｷ繝ｧ繝ｳ */
export const ShareListResponse = z.object({
  items: z.array(ShareListItem),
  nextCursor: z.string().nullable().default(null),
});
export type ShareListResponse = z.infer<typeof ShareListResponse>;

/** GET /api/shares/:id 謌仙粥繝ｬ繧ｹ繝昴Φ繧ｹ */
export const ShareGetResponse = ShareEntity;
export type ShareGetResponse = z.infer<typeof ShareGetResponse>;

/** POST /api/shares 謌仙粥繝ｬ繧ｹ繝昴Φ繧ｹ・井ｽ懈・蠕後・蜈ｨ菴灘ワ・・*/
export const ShareCreateResponse = ShareEntity;
export type ShareCreateResponse = z.infer<typeof ShareCreateResponse>;

/** 繧ｨ繝ｩ繝ｼ繝輔か繝ｼ繝槭ャ繝茨ｼ・I 繝医・繧ｹ繝磯｣謳ｺ繧呈Φ螳夲ｼ・*/
export const ApiError = z.object({
  code: z.union([
    z.literal("BAD_REQUEST"),
    z.literal("UNPROCESSABLE_ENTITY"),
    z.literal("UNAUTHORIZED"),
    z.literal("FORBIDDEN"),
    z.literal("NOT_FOUND"),
    z.literal("INTERNAL"),
  ]),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof ApiError>;
