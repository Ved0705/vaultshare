
import type { Request, Response } from "express";
import { z } from "zod";
import { revokeAllSharesService } from "./share-revocation.service.js";
import { revokeShareService } from "./share-revocation.service.js";
import { getAuthenticatedUserId } from "../../shared/get-authenticated-user.js";
import { AppError } from "../../shared/app-error.js";

const paramsSchema = z.object({
    id: z.string().uuid(),
    shareId: z.string().uuid(),
});

export async function revokeAllSharesController(
    req: Request,
    res: Response,
) {
    const params = z.object({
        id: z.string().uuid(),
    }).safeParse(req.params);

    if (!params.success) {
        throw new AppError(400, "INVALID_PARAMETERS", "Invalid vault ID.");
    }

    const ownerId = getAuthenticatedUserId(req);

    const result = await revokeAllSharesService(
        params.data.id,
        ownerId,
    );

    res.status(200).json({
        success: true,
        data: result,
    });
}

export async function revokeShareController(
    req: Request,
    res: Response,
) {
    const parsed = paramsSchema.safeParse(req.params);

    if (!parsed.success) {
        throw new AppError(400, "INVALID_PARAMETERS", "Invalid vault or share ID.");
    }

    const ownerId = getAuthenticatedUserId(req);

    const result = await revokeShareService(
        parsed.data.id,
        parsed.data.shareId,
        ownerId,
    );

    res.status(200).json({
        success: true,
        data: {
            share: result,
        },
    });
}
