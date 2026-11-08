import type { Request, Response, NextFunction } from "express";
import { z } from "zod";

import { AppError } from "../../shared/app-error.js";
import { getAuthenticatedUserId } from "../../shared/get-authenticated-user.js";
import { extendShareAccessService } from "./share-extension.service.js";

const paramsSchema = z.object({
    id: z.string().uuid(),
    shareId: z.string().uuid(),
});
const bodySchema = z.object({
    additionalAccesses: z.number().int().min(1).max(1000).default(1),
    extendPostOpenBySeconds: z.number().int().min(1).max(31_536_000).optional(),
}).strict();

export async function extendShareAccessController(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    try {
        const params = paramsSchema.safeParse(req.params);
        const body = bodySchema.safeParse(req.body);
        if (!params.success || !body.success) {
            throw new AppError(400, "VALIDATION_ERROR", "Invalid share extension data.");
        }

        const result = await extendShareAccessService({
            vaultId: params.data.id,
            shareId: params.data.shareId,
            ownerId: getAuthenticatedUserId(req),
            additionalAccesses: body.data.additionalAccesses,
            ...(body.data.extendPostOpenBySeconds !== undefined
                ? { extendPostOpenBySeconds: body.data.extendPostOpenBySeconds }
                : {}),
        });

        res.status(200).json({
            success: true,
            data: result,
            message: "Share access has been extended.",
        });
    } catch (error) {
        next(error);
    }
}
