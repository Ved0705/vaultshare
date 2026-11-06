
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { db } from "../../db/client.js";
import { vaults } from "../../db/schema/vaults.js";
import { shares } from "../../db/schema/shares.js";
import { cleanupJobs } from "../../db/schema/cleanup-jobs.js";
import { AppError } from "../../shared/app-error.js";

import {
    encryptVaultContent,
    decryptVaultContent,
} from "../../infrastructure/encryption/encryption.service.js";

import {
    createVault,
    findVaultByIdAndOwner,
    listVaultsByOwner,
    updateVaultMetadata,
} from "./vault.repository.js";

interface CreateVaultInput {
    ownerId: string;
    name: string;
    description?: string;
    content: string;
    overallTtlSeconds: number;
    expiryPolicy?: "DESTROY" | "REVOKE_ACCESS";
    folderId?: string | null;
}

interface UpdateVaultInput {
    name?: string;
    description?: string | null;
    folderId?: string | null;
}

export async function createVaultService(
    input: CreateVaultInput,
) {
    if (!input.name.trim()) {
        throw new AppError(400, "INVALID_VAULT_NAME", "Vault name is required");
    }

    if (
        !Number.isSafeInteger(input.overallTtlSeconds) ||
        input.overallTtlSeconds <= 0
    ) {
        throw new AppError(400, "INVALID_TTL", "TTL must be a positive integer");
    }

    const vaultId = randomUUID();

    const encrypted = encryptVaultContent(
        vaultId,
        input.content,
    );

    return createVault({
        id: vaultId,
        ownerId: input.ownerId,
        folderId: input.folderId ?? null,
        name: input.name.trim(),
        description: input.description ?? null,
        encryptedContent: encrypted.encryptedContent,
        encryptedDek: encrypted.encryptedDek,
        encryptionNonce: encrypted.encryptionNonce,
        encryptionTag: encrypted.encryptionTag,
        overallTtlSeconds: input.overallTtlSeconds,
        status: "ACTIVE",
        expiryPolicy: input.expiryPolicy ?? "DESTROY",
    });
}

export async function getVaultService(
    vaultId: string,
    ownerId: string,
) {
    const vault = await findVaultByIdAndOwner(vaultId, ownerId);

    if (!vault) {
        throw new AppError(404, "VAULT_NOT_FOUND", "Vault not found");
    }

    if (vault.status === "DESTROYED") {
        throw new AppError(
            410,
            "VAULT_DESTROYED",
            "This vault has been destroyed",
        );
    }

    const now = new Date();

    if (
        vault.expiryPolicy === "DESTROY" &&
        (
            vault.status === "EXPIRED" ||
            (vault.expiresAt !== null && vault.expiresAt <= now)
        )
    ) {
        throw new AppError(
            410,
            "VAULT_EXPIRED",
            "This vault has expired",
        );
    }

    const content = decryptVaultContent(vault.id, {
        encryptedContent: vault.encryptedContent,
        encryptedDek: vault.encryptedDek,
        encryptionNonce: vault.encryptionNonce,
        encryptionTag: vault.encryptionTag,
    });

    return {
        id: vault.id,
        ownerId: vault.ownerId,
        folderId: vault.folderId,
        name: vault.name,
        description: vault.description,
        content,
        status: vault.status,
        overallTtlSeconds: vault.overallTtlSeconds,
        firstSharedAt: vault.firstSharedAt,
        expiresAt: vault.expiresAt,
        expiryPolicy: vault.expiryPolicy,
        createdAt: vault.createdAt,
        updatedAt: vault.updatedAt,
    };
}

export async function listVaultsService(
    ownerId: string,
    limit = 20,
    offset = 0,
) {
    if (
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 100 ||
        !Number.isInteger(offset) ||
        offset < 0
    ) {
        throw new AppError(400, "INVALID_PAGINATION", "Invalid pagination values");
    }

    return listVaultsByOwner(ownerId, limit, offset);
}

export async function updateVaultService(
    vaultId: string,
    ownerId: string,
    input: UpdateVaultInput,
) {
    const existingVault = await findVaultByIdAndOwner(vaultId, ownerId);

    if (!existingVault) {
        throw new AppError(404, "VAULT_NOT_FOUND", "Vault not found");
    }

    if (existingVault.status === "DESTROYED") {
        throw new AppError(
            410,
            "VAULT_DESTROYED",
            "This vault has been destroyed",
        );
    }

    const now = new Date();

    if (
        existingVault.expiryPolicy === "DESTROY" &&
        (
            existingVault.status === "EXPIRED" ||
            (
                existingVault.expiresAt !== null &&
                existingVault.expiresAt <= now
            )
        )
    ) {
        throw new AppError(
            410,
            "VAULT_EXPIRED",
            "This vault has expired",
        );
    }

    const ownerCanManage =
        existingVault.status === "ACTIVE" ||
        (
            existingVault.expiryPolicy === "REVOKE_ACCESS" &&
            (
                existingVault.status === "EXPIRED" ||
                existingVault.status === "REVOKED"
            )
        );

    if (!ownerCanManage) {
        throw new AppError(
            409,
            "VAULT_NOT_EDITABLE",
            "This vault cannot be updated",
        );
    }

    if (
        input.name !== undefined &&
        !input.name.trim()
    ) {
        throw new AppError(
            400,
            "INVALID_VAULT_NAME",
            "Vault name cannot be empty",
        );
    }

    const updated = await updateVaultMetadata(
        vaultId,
        ownerId,
        {
            ...input,
            ...(input.name !== undefined
                ? { name: input.name.trim() }
                : {}),
        },
    );

    if (!updated) {
        throw new AppError(
            404,
            "VAULT_NOT_FOUND",
            "Vault not found",
        );
    }

    return updated;
}

export async function deleteVaultService(
    vaultId: string,
    ownerId: string,
): Promise<void> {
    await db.transaction(async (tx) => {
        const [vault] = await tx
            .select({
                id: vaults.id,
                status: vaults.status,
            })
            .from(vaults)
            .where(
                and(
                    eq(vaults.id, vaultId),
                    eq(vaults.ownerId, ownerId),
                ),
            )
            .for("update")
            .limit(1);

        if (!vault) {
            throw new AppError(
                404,
                "VAULT_NOT_FOUND",
                "Vault not found.",
            );
        }

        if (vault.status === "DESTROYED") {
            return;
        }

        const now = new Date();

        await tx
            .update(vaults)
            .set({
                status: "DESTROYED",
                encryptedContent: "",
                encryptedDek: "",
                encryptionNonce: "",
                encryptionTag: "",
                updatedAt: now,
            })
            .where(eq(vaults.id, vault.id));

        await tx
            .update(shares)
            .set({
                status: "expired",
                updatedAt: now,
            })
            .where(
                and(
                    eq(shares.vaultId, vault.id),
                    eq(shares.status, "active"),
                ),
            );

        await tx
            .insert(cleanupJobs)
            .values({
                resourceType: "VAULT",
                resourceId: vault.id,
            })
            .onConflictDoNothing();
    });
}
