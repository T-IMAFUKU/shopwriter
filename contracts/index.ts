import { z } from "zod";
import { shareCreateSchema, shareListQuerySchema } from "./share";

export { shareCreateSchema, shareListQuerySchema };

export type ShareCreate = z.infer<typeof shareCreateSchema>;
export type ShareListQuery = z.infer<typeof shareListQuerySchema>;