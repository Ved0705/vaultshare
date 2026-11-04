
import type { Request, Response, NextFunction } from "express";

import { AppError } from "../../shared/app-error.js";
import { getAuthenticatedUserId } from "../../shared/get-authenticated-user.js";

import { getWriteRequestDetailService } from "./write-request-detail.service.js";
import { reviewWriteRequestParamsSchema } from "./write-request.validation.js";

export async function getWriteRequestDetailController(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    try {
        const params = reviewWriteRequestParamsSchema.safeParse(req.params);

        if (!params.success) {
            throw new AppError(400, "VALIDATION_ERROR", "Invalid request parameters.");
        }

        const result = await getWriteRequestDetailService(
            params.data.requestId,
            params.data.id,
            getAuthenticatedUserId(req),
        );

        res.status(200).json({
            success: true,
            data: result,
        });
    } catch (error) {
        next(error);
    }
}
