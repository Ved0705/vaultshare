import type { Request, Response, NextFunction } from "express";
import { z } from "zod";

import { AppError } from "../../shared/app-error.js";
import { getAuthenticatedUserId } from "../../shared/get-authenticated-user.js";
import { listOwnAuditEventsService } from "./audit-history.service.js";

const querySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    offset: z.coerce.number().int().min(0).default(0),
}).strict();

export async function listOwnAuditEventsController(req: Request, res: Response, next: NextFunction) {
    try {
        const parsed = querySchema.safeParse(req.query);
        if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "Invalid audit history pagination.");
        const events = await listOwnAuditEventsService(
            getAuthenticatedUserId(req),
            parsed.data.limit,
            parsed.data.offset,
        );
        res.status(200).json({ success: true, data: { events, limit: parsed.data.limit, offset: parsed.data.offset } });
    } catch (error) {
        next(error);
    }
}
