import { z } from "zod";

export const openShareSchema = z.object({
    passphrase: z.string().min(1).max(128),
}).strict();

export const shareCodeParamSchema = z.object({
    shareCode: z.string().length(32).regex(/^[A-Za-z0-9_-]+$/),
});
