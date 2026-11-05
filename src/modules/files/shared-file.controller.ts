import type { Request, Response, NextFunction } from "express";

import { AppError } from "../../shared/app-error.js";
import { getAuthenticatedUserId } from "../../shared/get-authenticated-user.js";

import {
    listSharedFilesService,
    downloadSharedFileService,
} from "./shared-file.service.js";

import {
    sharedFileListParamsSchema,
    sharedFileDownloadParamsSchema,
    sharedFileAccessBodySchema,
} from "./shared-file.validation.js";

export async function listSharedFilesController(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    try {
        const params = sharedFileListParamsSchema.safeParse(req.params);
        const body = sharedFileAccessBodySchema.safeParse(req.body);

        if (!params.success || !body.success) {
            throw new AppError(
                400,
                "VALIDATION_ERROR",
                "Invalid shared file listing request.",
            );
        }

        const files = await listSharedFilesService({
            shareCode: params.data.shareCode,
            readerId: getAuthenticatedUserId(req),
            passphrase: body.data.passphrase,
        });

        res.status(200).json({
            success: true,
            data: { files },
        });
    } catch (error) {
        next(error);
    }
}

export async function downloadSharedFileController(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    try {
        const params = sharedFileDownloadParamsSchema.safeParse(req.params);
        const body = sharedFileAccessBodySchema.safeParse(req.body);

        if (!params.success || !body.success) {
            throw new AppError(
                400,
                "VALIDATION_ERROR",
                "Invalid shared file download request.",
            );
        }

        const result = await downloadSharedFileService({
            shareCode: params.data.shareCode,
            fileId: params.data.fileId,
            readerId: getAuthenticatedUserId(req),
            passphrase: body.data.passphrase,
        });

        const safeFilename = encodeURIComponent(result.originalName);

        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="download"; filename*=UTF-8''${safeFilename}`,
        );
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Content-Length", result.content.length);

        res.status(200).send(result.content);
    } catch (error) {
        next(error);
    }
}