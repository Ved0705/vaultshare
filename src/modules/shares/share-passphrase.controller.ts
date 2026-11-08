import type { Request, Response, NextFunction } from "express";
import { z } from "zod";

import { AppError } from "../../shared/app-error.js";
import { getAuthenticatedUserId } from "../../shared/get-authenticated-user.js";
import { generateSharePassphraseService } from "./share-passphrase.service.js";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function generateSharePassphraseController(req: Request, res: Response, next: NextFunction) {
    try {
        const parsed = paramsSchema.safeParse(req.params);
        if (!parsed.success) throw new AppError(400, "INVALID_VAULT_ID", "Invalid vault ID.");
        const result = await generateSharePassphraseService(parsed.data.id, getAuthenticatedUserId(req));
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
}
