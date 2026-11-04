
import type { Request, Response, NextFunction } from "express";
import { AppError } from "../../shared/app-error.js";
import { getAuthenticatedUserId } from "../../shared/get-authenticated-user.js";
import { listVaultWriteRequests } from "./write-request.repository.js";
import {
    listWriteRequestsQuerySchema,
    reviewWriteRequestParamsSchema,
} from "./write-request.validation.js";

export async function listWriteRequestsController(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    try {
        const params = reviewWriteRequestParamsSchema.safeParse({
            id: req.params.id,
            requestId: "00000000-0000-4000-8000-000000000000",
        });
        const query = listWriteRequestsQuerySchema.safeParse(req.query);

        if (!params.success || !query.success) {
            throw new AppError(400, "VALIDATION_ERROR", "Invalid request parameters.");
        }

        const requests = await listVaultWriteRequests(
            params.data.id,
            getAuthenticatedUserId(req),
            query.data.limit,
            query.data.offset,
        );

        if (requests === null) {
            throw new AppError(404, "VAULT_NOT_FOUND", "Vault not found.");
        }

        res.status(200).json({
            success: true,
            data: { requests },
        });
    } catch (error) {
        next(error);
    }
}
