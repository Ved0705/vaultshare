
import type { Request, Response } from "express";
import { z } from "zod";

import { AppError } from "../../shared/app-error.js";
import { getAuthenticatedUserId } from "../../shared/get-authenticated-user.js";
import { cancelAccessRequestService } from "./access-request-cancel.service.js";

const paramsSchema = z.object({
    requestId: z.string().uuid(),
});

export async function cancelAccessRequestController(
    req: Request,
    res: Response,
) {
    const params = paramsSchema.safeParse(req.params);

    if (!params.success) {
        throw new AppError(
            400,
            "INVALID_PARAMETERS",
            "Invalid access request ID.",
        );
    }

    const result = await cancelAccessRequestService(
        params.data.requestId,
        getAuthenticatedUserId(req),
    );

    res.status(200).json({
        success: true,
        data: { request: result },
    });
}
