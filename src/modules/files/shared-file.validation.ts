import { z } from "zod";

const shareCodeSchema = z
    .string()
    .regex(/^[A-Za-z0-9_-]{32}$/, "Invalid share code.");

export const sharedFileListParamsSchema = z.object({
    shareCode: shareCodeSchema,
}).strict();

export const sharedFileDownloadParamsSchema = z.object({
    shareCode: shareCodeSchema,
    fileId: z.string().uuid(),
}).strict();

export const sharedFileAccessBodySchema = z.object({
    passphrase: z.string().min(1).max(128),
}).strict();