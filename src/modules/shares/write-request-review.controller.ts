
import type { Request, Response, NextFunction } from "express";

import { AppError } from "../../shared/app-error.js";
import { getAuthenticatedUserId } from "../../shared/get-authenticated-user.js";

import { reviewWriteRequestService } from "./write-request-review.service.js";
import { reviewWriteRequestParamsSchema, reviewWriteRequestSchema } from "./write-request.validation.js";

export async function reviewWriteRequestController(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    try {
        const params = reviewWriteRequestParamsSchema.safeParse(req.params);
        const body = reviewWriteRequestSchema.safeParse(req.body);

        if (!params.success || !body.success) {
            throw new AppError(400, "VALIDATION_ERROR", "Invalid review request.");
        }

        const result = await reviewWriteRequestService({
            vaultId: params.data.id,
            requestId: params.data.requestId,
            ownerId: getAuthenticatedUserId(req),
            decision: body.data.decision,
        });

        res.status(200).json({
            success: true,
            data: result,
        });
    } catch (error) {
        next(error);
    }
}
