import { z } from "zod";

export const createWriteRequestSchema = z.object({
    proposedContent: z.string().min(1).max(900_000),
    passphrase: z.string().min(1).max(128),
}).strict();

export const reviewWriteRequestSchema = z.object({
    decision: z.enum(["APPROVE", "REJECT"]),
}).strict();

export const writeRequestIdParamSchema = z.object({
    requestId: z.string().uuid(),
});

export const reviewWriteRequestParamsSchema = z.object({
    id: z.string().uuid(),
    requestId: z.string().uuid(),
});
export const listWriteRequestsQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
});