import { z } from "zod";

export const createVaultSchema = z.object({
    name: z.string().trim().min(1).max(150),

    description: z.string().max(500).optional(),

    content: z.string().min(1).max(900_000),

    overallTtlSeconds: z.number()
        .int()
        .positive()
        .max(2_147_483_647),

    folderId: z.string().uuid().nullable().optional(),
}).strict();

export const updateVaultSchema = z.object({
    name: z.string().trim().min(1).max(150).optional(),

    description: z.string().max(500).nullable().optional(),

    folderId: z.string().uuid().nullable().optional(),
})
    .strict()
    .refine(
        (data) => Object.keys(data).length > 0,
        "At least one field must be provided",
    );

export const vaultIdParamSchema = z.object({
    id: z.string().uuid(),
});

export const listVaultsQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),

    offset: z.coerce.number().int().min(0).default(0),
});