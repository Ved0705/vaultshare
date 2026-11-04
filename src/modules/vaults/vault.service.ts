import { randomUUID } from "node:crypto";

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
        expiryPolicy: "DESTROY",
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
        throw new AppError(410, "VAULT_DESTROYED", "This vault has been destroyed");
    }

    if (
        vault.status === "EXPIRED" &&
        vault.expiryPolicy === "DESTROY"
    ) {
        throw new AppError(410, "VAULT_EXPIRED", "This vault has expired");
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

    if (existingVault.status !== "ACTIVE") {
        throw new AppError(409, "VAULT_NOT_EDITABLE", "Only active vaults can be updated");
    }

    if (
        input.name !== undefined &&
        !input.name.trim()
    ) {
        throw new AppError(400, "INVALID_VAULT_NAME", "Vault name cannot be empty");
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
        throw new AppError(404, "VAULT_NOT_FOUND", "Vault not found");
    }

    return updated;
}