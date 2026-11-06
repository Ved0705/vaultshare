
import {
    createVaultService,
    getVaultService,
    listVaultsService,
    updateVaultService,
    deleteVaultService,
    revokeVaultService,
} from "./vault.service.js";
import type { Request, Response, NextFunction } from "express";
import type { vaults } from "../../db/schema/vaults.js";
import { AppError } from "../../shared/app-error.js";
import { getAuthenticatedUserId } from "../../shared/get-authenticated-user.js";
import {revokeShareController} from "../shares/share-revocation.controller.js";

import {
    createVaultSchema,
    updateVaultSchema,
    vaultIdParamSchema,
    listVaultsQuerySchema,
} from "./vault.validation.js";

type VaultRecord = typeof vaults.$inferSelect;

function toVaultMetadata(vault: VaultRecord) {
    return {
        id: vault.id,
        folderId: vault.folderId,
        name: vault.name,
        description: vault.description,
        status: vault.status,
        overallTtlSeconds: vault.overallTtlSeconds,
        firstSharedAt: vault.firstSharedAt,
        expiresAt: vault.expiresAt,
        expiryPolicy: vault.expiryPolicy,
        createdAt: vault.createdAt,
        updatedAt: vault.updatedAt,
    };
}

export async function createVaultController(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    try {
        const parsed = createVaultSchema.safeParse(req.body);

        if (!parsed.success) {
            throw new AppError(
                400,
                "VALIDATION_ERROR",
                "Invalid vault data",
            );
        }

        const vault = await createVaultService({
            ownerId: getAuthenticatedUserId(req),
            name: parsed.data.name,
            content: parsed.data.content,
            overallTtlSeconds: parsed.data.overallTtlSeconds,
            expiryPolicy: parsed.data.expiryPolicy,
            ...(parsed.data.description !== undefined
                ? { description: parsed.data.description }
                : {}),
            ...(parsed.data.folderId !== undefined
                ? { folderId: parsed.data.folderId }
                : {}),
        });

        if (!vault) {
            throw new AppError(
                500,
                "VAULT_CREATION_FAILED",
                "Failed to create vault",
            );
        }

        res.status(201).json({
            success: true,
            data: toVaultMetadata(vault),
        });
    } catch (error) {
        next(error);
    }
}

export async function listVaultsController(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    try {
        const parsed = listVaultsQuerySchema.safeParse(req.query);

        if (!parsed.success) {
            throw new AppError(
                400,
                "VALIDATION_ERROR",
                "Invalid pagination",
            );
        }

        const vaults = await listVaultsService(
            getAuthenticatedUserId(req),
            parsed.data.limit,
            parsed.data.offset,
        );

        res.status(200).json({
            success: true,
            data: vaults,
        });
    } catch (error) {
        next(error);
    }
}

export async function getVaultController(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    try {
        const parsed = vaultIdParamSchema.safeParse(req.params);

        if (!parsed.success) {
            throw new AppError(
                400,
                "VALIDATION_ERROR",
                "Invalid vault ID",
            );
        }

        const vault = await getVaultService(
            parsed.data.id,
            getAuthenticatedUserId(req),
        );

        res.status(200).json({
            success: true,
            data: vault,
        });
    } catch (error) {
        next(error);
    }
}

export async function updateVaultController(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    try {
        const params = vaultIdParamSchema.safeParse(req.params);
        const body = updateVaultSchema.safeParse(req.body);

        if (!params.success || !body.success) {
            throw new AppError(
                400,
                "VALIDATION_ERROR",
                "Invalid update data",
            );
        }

        const vault = await updateVaultService(
            params.data.id,
            getAuthenticatedUserId(req),
            {
                ...(body.data.name !== undefined
                    ? { name: body.data.name }
                    : {}),
                ...(body.data.description !== undefined
                    ? { description: body.data.description }
                    : {}),
                ...(body.data.folderId !== undefined
                    ? { folderId: body.data.folderId }
                    : {}),
            },
        );

        if (!vault) {
            throw new AppError(
                404,
                "VAULT_NOT_FOUND",
                "Vault not found",
            );
        }

        res.status(200).json({
            success: true,
            data: toVaultMetadata(vault),
        });
    } catch (error) {
        next(error);
    }
}
export async function deleteVaultController(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    try {
        const parsed = vaultIdParamSchema.safeParse(req.params);

        if (!parsed.success) {
            throw new AppError(
                400,
                "VALIDATION_ERROR",
                "Invalid vault ID",
            );
        }

        await deleteVaultService(
            parsed.data.id,
            getAuthenticatedUserId(req),
        );

        res.status(200).json({
            success: true,
            message: "Vault permanently destroyed.",
        });
    } catch (error) {
        next(error);
    }
}
export async function revokeVaultController(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    try {
        const parsed = vaultIdParamSchema.safeParse(req.params);

        if (!parsed.success) {
            throw new AppError(
                400,
                "VALIDATION_ERROR",
                "Invalid vault ID",
            );
        }

        await revokeVaultService(
            parsed.data.id,
            getAuthenticatedUserId(req),
        );

        res.status(200).json({
            success: true,
            message: "Vault access revoked. Derived copies destroyed.",
        });
    } catch (error) {
        next(error);
    }
}