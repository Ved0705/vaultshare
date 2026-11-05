
import { z } from "zod";

export const createAccessRequestSchema = z.object({
    message: z.string().trim().max(500).optional(),
}).strict();

export const accessRequestParamsSchema = z.object({
    vaultId: z.string().uuid(),
});
