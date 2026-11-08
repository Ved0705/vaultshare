import type { Request, Response, NextFunction } from "express";
import { z } from "zod";

import { AppError } from "../../shared/app-error.js";
import { getAuthenticatedUserId } from "../../shared/get-authenticated-user.js";
import {
    createFolderService,
    deleteFolderService,
    listFoldersService,
    updateFolderService,
} from "./folder.service.js";

const folderIdSchema = z.object({ id: z.string().uuid() });
const folderBodySchema = z.object({ name: z.string().trim().min(1).max(100) }).strict();

export async function createFolderController(req: Request, res: Response, next: NextFunction) {
    try {
        const parsed = folderBodySchema.safeParse(req.body);
        if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "Folder name must contain 1 to 100 characters.");
        const result = await createFolderService(getAuthenticatedUserId(req), parsed.data.name);
        res.status(201).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
}

export async function listFoldersController(req: Request, res: Response, next: NextFunction) {
    try {
        const result = await listFoldersService(getAuthenticatedUserId(req));
        res.status(200).json({ success: true, data: { folders: result } });
    } catch (error) {
        next(error);
    }
}

export async function updateFolderController(req: Request, res: Response, next: NextFunction) {
    try {
        const params = folderIdSchema.safeParse(req.params);
        const body = folderBodySchema.safeParse(req.body);
        if (!params.success) throw new AppError(400, "INVALID_FOLDER_ID", "Invalid folder ID.");
        if (!body.success) throw new AppError(400, "VALIDATION_ERROR", "Folder name must contain 1 to 100 characters.");
        const result = await updateFolderService(params.data.id, getAuthenticatedUserId(req), body.data.name);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
}

export async function deleteFolderController(req: Request, res: Response, next: NextFunction) {
    try {
        const parsed = folderIdSchema.safeParse(req.params);
        if (!parsed.success) throw new AppError(400, "INVALID_FOLDER_ID", "Invalid folder ID.");

        const result = await deleteFolderService(parsed.data.id, getAuthenticatedUserId(req));
        res.status(200).json({
            success: true,
            data: result,
            message: "Folder deleted. Its vaults were kept and moved to the root.",
        });
    } catch (error) {
        next(error);
    }
}
