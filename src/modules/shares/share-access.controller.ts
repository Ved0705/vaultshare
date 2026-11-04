import type { Request, Response, NextFunction } from "express";

import { AppError } from "../../shared/app-error.js";
import { getAuthenticatedUserId } from "../../shared/get-authenticated-user.js";

import { openShareService } from "./share-access.service.js";
import {
    openShareSchema,
    shareCodeParamSchema,
} from "./share-access.validation.js";

export async function openShareController(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    try {
        const params = shareCodeParamSchema.safeParse(req.params);
        const body = openShareSchema.safeParse(req.body);

        if (!params.success || !body.success) {
            throw new AppError(
                400,
                "VALIDATION_ERROR",
                "Invalid share access request",
            );
        }

        const result = await openShareService({
            shareCode: params.data.shareCode,
            readerId: getAuthenticatedUserId(req),
            passphrase: body.data.passphrase,
        });

        res.status(200).json({
            success: true,
            data: result,
        });
    } catch (error) {
        next(error);
    }
}