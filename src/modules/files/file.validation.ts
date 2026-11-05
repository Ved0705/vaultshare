
import { z } from "zod";

export const fileVaultParamSchema = z.object({
    id: z.string().uuid(),
});

export const fileIdParamSchema = z.object({
    id: z.string().uuid(),
    fileId: z.string().uuid(),
});
export const listFilesQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
});

export const sharedFileAccessSchema = z.object({
    passphrase: z.string().min(1).max(128),
}).strict();

export const sharedFileParamsSchema = z.object({
    shareCode: z.string().regex(/^[A-Za-z0-9_-]{32}$/),
    fileId: z.string().uuid(),
});