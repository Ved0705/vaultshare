
import type { Request, Response, NextFunction } from "express";

import { AppError } from "../../shared/app-error.js";
import { getAuthenticatedUserId } from "../../shared/get-authenticated-user.js";

import { createShareService } from "./share.service.js";
import { createShareSchema } from "./share.validation.js";

export async function createShareController(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    try {
        const params = req.params as { id?: string };
        const parsed = createShareSchema.safeParse(req.body);

        if (!params.id) {
            throw new AppError(
                400,
                "INVALID_VAULT_ID",
                "Vault ID is required",
            );
        }

        if (!parsed.success) {
            throw new AppError(
                400,
                "VALIDATION_ERROR",
                "Invalid share data",
            );
        }

        const share = await createShareService({
            vaultId: params.id,
            ownerId: getAuthenticatedUserId(req),
            readerId: parsed.data.readerId,
            permissions: parsed.data.permissions,
            maxAccessCount: parsed.data.maxAccessCount,
            postOpenTtlSeconds: parsed.data.postOpenTtlSeconds,
            passphrase: parsed.data.passphrase,
        });

        res.status(201).json({
            success: true,
            data: share,
        });
    } catch (error) {
        next(error);
    }
}
