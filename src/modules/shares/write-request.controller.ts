import type { Request, Response, NextFunction } from "express";

import { AppError } from "../../shared/app-error.js";
import { getAuthenticatedUserId } from "../../shared/get-authenticated-user.js";

import { createWriteRequestService } from "./write-request.service.js";
import { createWriteRequestSchema } from "./write-request.validation.js";
import { shareCodeParamSchema } from "./share-access.validation.js";

export async function createWriteRequestController(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    try {
        const params = shareCodeParamSchema.safeParse(req.params);
        const body = createWriteRequestSchema.safeParse(req.body);

        if (!params.success || !body.success) {
            throw new AppError(
                400,
                "VALIDATION_ERROR",
                "Invalid write request.",
            );
        }

        const result = await createWriteRequestService({
            shareCode: params.data.shareCode,
            readerId: getAuthenticatedUserId(req),
            proposedContent: body.data.proposedContent,
            passphrase: body.data.passphrase,
        });

        res.status(201).json({
            success: true,
            data: result,
        });
    } catch (error) {
        next(error);
    }
}