
import { z } from "zod";

export const ownerAccessRequestParamsSchema = z.object({
    id: z.string().uuid(),
    requestId: z.string().uuid().optional(),
});

export const reviewAccessRequestSchema = z.object({
    decision: z.enum(["APPROVE", "REJECT"]),
    responseMessage: z.string().trim().max(500).optional(),
}).strict();
