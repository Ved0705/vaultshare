import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import { getAuthenticatedUserId } from "../../shared/get-authenticated-user.js";
import { AppError } from "../../shared/app-error.js";
import { listVaultSharesService } from "./share-list.service.js";

const paramsSchema = z.object({
    id: z.string().uuid(),
});

export async function listVaultSharesController(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    try {
        const parsed = paramsSchema.safeParse(req.params);

        if (!parsed.success) {
            throw new AppError(
                400,
                "INVALID_PARAMETERS",
                "Invalid vault ID.",
            );
        }

        const ownerId = getAuthenticatedUserId(req);

        const records = await listVaultSharesService(
            parsed.data.id,
            ownerId,
        );

        res.status(200).json({
            success: true,
            data: records,
        });
    } catch (error) {
        next(error);
    }
}