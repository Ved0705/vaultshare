import { downloadFileService } from "./file.service.js";
import { fileIdParamSchema } from "./file.validation.js";
import type { Request, Response, NextFunction } from "express";
import { AppError } from "../../shared/app-error.js";
import { getAuthenticatedUserId } from "../../shared/get-authenticated-user.js";
import {deleteFileService} from "./file.service.js";
import { fileVaultParamSchema } from "./file.validation.js";
import { uploadFileService } from "./file.service.js";

export async function uploadFileController(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    try {
        const params = fileVaultParamSchema.safeParse(req.params);

        if (!params.success) {
            throw new AppError(400, "VALIDATION_ERROR", "Invalid vault ID.");
        }

        if (!req.file) {
            throw new AppError(400, "FILE_REQUIRED", "Please provide a file.");
        }

        const result = await uploadFileService({
            vaultId: params.data.id,
            ownerId: getAuthenticatedUserId(req),
            file: req.file,
        });

        res.status(201).json({
            success: true,
            data: result,
        });
    } catch (error) {
        next(error);
    }
}


export async function downloadFileController(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    try {
        const params = fileIdParamSchema.safeParse(req.params);

        if (!params.success) {
            throw new AppError(400, "VALIDATION_ERROR", "Invalid file parameters.");
        }

        const result = await downloadFileService({
            vaultId: params.data.id,
            fileId: params.data.fileId,
            ownerId: getAuthenticatedUserId(req),
        });

        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Content-Disposition", `attachment; filename="download"`);
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Content-Length", result.content.length);

        res.status(200).send(result.content);
    } catch (error) {
        next(error);
    }
}

import { listFilesQuerySchema } from "./file.validation.js";
import { listVaultFilesService } from "./file.service.js";

export async function listFilesController(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    try {
        const params = fileVaultParamSchema.safeParse(req.params);
        const query = listFilesQuerySchema.safeParse(req.query);

        if (!params.success || !query.success) {
            throw new AppError(400, "VALIDATION_ERROR", "Invalid file listing parameters.");
        }

        const result = await listVaultFilesService({
            vaultId: params.data.id,
            ownerId: getAuthenticatedUserId(req),
            limit: query.data.limit,
            offset: query.data.offset,
        });

        res.status(200).json({
            success: true,
            data: { files: result },
        });
    } catch (error) {
        next(error);
    }
}
export async function deleteFileController(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    try {
        const params = fileIdParamSchema.safeParse(req.params);

        if (!params.success) {
            throw new AppError(400, "INVALID_PARAMETERS", "Invalid file parameters.");
        }

        await deleteFileService({
            vaultId: params.data.id,
            fileId: params.data.fileId,
            ownerId: getAuthenticatedUserId(req),
        });

        res.status(204).send();
    } catch (error) {
        next(error);
    }
}