
import { z } from "zod";

export const createShareSchema = z.object({
    readerId: z.string().uuid(),

    permissions: z
        .array(z.enum(["READ", "WRITE"]))
        .min(1)
        .max(2)
        .refine(
            (permissions) => new Set(permissions).size === permissions.length,
            "Duplicate permissions are not allowed",
        ),

    maxAccessCount: z.number().int().positive().max(1000),

    postOpenTtlSeconds: z.number().int().positive().nullable(),

    passphrase: z.string().min(12).max(128),
}).strict();
