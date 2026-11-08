import type { Request, Response, NextFunction } from "express";
import { z } from "zod";

import { AppError } from "../../shared/app-error.js";
import { getAuthenticatedUserId } from "../../shared/get-authenticated-user.js";
import { deleteFolderService } from "./folder.service.js";

const folderIdSchema = z.object({ id: z.string().uuid() });

export async function deleteFolderController(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    try {
        const parsed = folderIdSchema.safeParse(req.params);
        if (!parsed.success) {
            throw new AppError(400, "INVALID_FOLDER_ID", "Invalid folder ID.");
        }

        const result = await deleteFolderService(
            parsed.data.id,
            getAuthenticatedUserId(req),
        );

        res.status(200).json({
            success: true,
            data: result,
            message: "Folder deleted. Its vaults were kept and moved to the root.",
        });
    } catch (error) {
        next(error);
    }
}
