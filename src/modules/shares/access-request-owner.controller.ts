
import type { Request, Response } from "express";

import { AppError } from "../../shared/app-error.js";
import { getAuthenticatedUserId } from "../../shared/get-authenticated-user.js";

import {
    listAccessRequestsService,
    reviewAccessRequestService,
} from "./access-request-owner.service.js";

import {
    ownerAccessRequestParamsSchema,
    reviewAccessRequestSchema,
} from "./access-request-owner.validation.js";

export async function listAccessRequestsController(
    req: Request,
    res: Response,
) {
    const params = ownerAccessRequestParamsSchema.safeParse(req.params);

    if (!params.success) {
        throw new AppError(400, "INVALID_PARAMETERS", "Invalid vault ID.");
    }

    const requests = await listAccessRequestsService(
        params.data.id,
        getAuthenticatedUserId(req),
    );

    res.status(200).json({
        success: true,
        data: { requests },
    });
}

export async function reviewAccessRequestController(
    req: Request,
    res: Response,
) {
    const params = ownerAccessRequestParamsSchema.safeParse(req.params);
    const body = reviewAccessRequestSchema.safeParse(req.body);

    if (!params.success || !params.data.requestId || !body.success) {
        throw new AppError(400, "INVALID_REQUEST", "Invalid review request.");
    }

    const request = await reviewAccessRequestService(
        params.data.id,
        params.data.requestId,
        getAuthenticatedUserId(req),
        body.data.decision,
        body.data.responseMessage,
    );

    res.status(200).json({
        success: true,
        data: { request },
    });
}
