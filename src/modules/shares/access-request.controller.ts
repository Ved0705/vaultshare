
import type { Request, Response } from "express";
import { AppError } from "../../shared/app-error.js";
import { getAuthenticatedUserId } from "../../shared/get-authenticated-user.js";
import { createAccessRequestService } from "./access-request.service.js";
import {
    accessRequestParamsSchema,
    createAccessRequestSchema,
} from "./access-request.validation.js";

export async function createAccessRequestController(
    req: Request,
    res: Response,
) {
    const params = accessRequestParamsSchema.safeParse(req.params);
    const body = createAccessRequestSchema.safeParse(req.body);

    if (!params.success || !body.success) {
        throw new AppError(
            400,
            "INVALID_REQUEST",
            "Invalid access request parameters or body.",
        );
    }

    const requesterId = getAuthenticatedUserId(req);

    const request = await createAccessRequestService(
        params.data.vaultId,
        requesterId,
        body.data.message,
    );

    res.status(201).json({
        success: true,
        data: { request },
    });
}
