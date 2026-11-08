
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { readEncryptedFile } from "./file-storage.service.js";
import { decryptFileContent, encryptFileContent } from "../../infrastructure/encryption/encryption.service.js";
import { db } from "../../db/client.js";
import { files } from "../../db/schema/files.js";
import { vaults } from "../../db/schema/vaults.js";
import { cleanupJobs } from "../../db/schema/cleanup-jobs.js";
import {
    storeEncryptedFile,
    deleteStoredFile,
} from "./file-storage.service.js";
import { AppError } from "../../shared/app-error.js";

function canOwnerAccessVault(vault: {
    status: string;
    expiryPolicy: string;
    expiresAt: Date | null;
}): boolean {
    if (vault.expiryPolicy === "REVOKE_ACCESS") {
        return ["ACTIVE", "EXPIRED", "REVOKED"].includes(vault.status);
    }

    return (
        vault.status === "ACTIVE" &&
        (!vault.expiresAt || vault.expiresAt > new Date())
    );
}

interface UploadFileInput {
    vaultId: string;
    ownerId: string;
    file: Express.Multer.File;
}

export async function uploadFileService(input: UploadFileInput) {
    if (!input.file || input.file.size === 0) {
        throw new AppError(400, "EMPTY_FILE", "Uploaded file is empty.");
    }

    if (input.file.size > 10 * 1024 * 1024) {
        throw new AppError(413, "FILE_TOO_LARGE", "Maximum file size is 10 MB.");
    }

    const fileId = randomUUID();

    const originalName = input.file.originalname
        .replace(/[\\/\0-\x1f\x7f]/g, "_")
        .slice(0, 255);

    const mimeType = (input.file.mimetype || "application/octet-stream")
        .slice(0, 255);

    let storageKey: string | undefined;

    try {
        const result = await db.transaction(async (tx) => {
            const [vault] = await tx
                .select({
                    id: vaults.id,
                    encryptedDek: vaults.encryptedDek,
                    kekVersion: vaults.kekVersion,
                    status: vaults.status,
                    expiresAt: vaults.expiresAt,
                    expiryPolicy: vaults.expiryPolicy,
                })
                .from(vaults)
                .where(
                    and(
                        eq(vaults.id, input.vaultId),
                        eq(vaults.ownerId, input.ownerId),
                    ),
                )
                .for("update")
                .limit(1);

            if (!vault) {
                throw new AppError(404, "VAULT_NOT_FOUND", "Vault not found.");
            }

            if (!canOwnerAccessVault(vault)) {
                throw new AppError(
                    410,
                    "VAULT_UNAVAILABLE",
                    "Vault is not available.",
                );
            }

            const encrypted = encryptFileContent(
                vault.id,
                fileId,
                input.file.buffer,
                { encryptedDek: vault.encryptedDek, kekVersion: vault.kekVersion },
            );

            storageKey = await storeEncryptedFile(encrypted.encryptedContent);

            const [savedFile] = await tx
                .insert(files)
                .values({
                    id: fileId,
                    vaultId: vault.id,
                    originalName,
                    mimeType,
                    sizeBytes: input.file.size,
                    storageKey,
                    encryptedDek: encrypted.encryptedDek,
                    encryptionNonce: encrypted.encryptionNonce,
                    encryptionTag: encrypted.encryptionTag,
                    status: "ACTIVE",
                })
                .returning({
                    id: files.id,
                    vaultId: files.vaultId,
                    originalName: files.originalName,
                    mimeType: files.mimeType,
                    sizeBytes: files.sizeBytes,
                    createdAt: files.createdAt,
                });

            return savedFile;
        });

        return result;
    } catch (error) {
        if (storageKey) {
            await deleteStoredFile(storageKey).catch(() => undefined);
        }

        throw error;
    }
}

export async function downloadFileService(input: {
    vaultId: string;
    fileId: string;
    ownerId: string;
}) {
    const [result] = await db
        .select({
            file: files,
            vault: {
                id: vaults.id,
                encryptedDek: vaults.encryptedDek,
                kekVersion: vaults.kekVersion,
                status: vaults.status,
                expiresAt: vaults.expiresAt,
                expiryPolicy: vaults.expiryPolicy,
            },
        })
        .from(files)
        .innerJoin(vaults, eq(files.vaultId, vaults.id))
        .where(
            and(
                eq(files.id, input.fileId),
                eq(files.vaultId, input.vaultId),
                eq(vaults.ownerId, input.ownerId),
            ),
        )
        .limit(1);

    if (!result || result.file.status !== "ACTIVE") {
        throw new AppError(404, "FILE_NOT_FOUND", "File not found.");
    }

    if (!canOwnerAccessVault(result.vault)) {
        throw new AppError(
            410,
            "VAULT_UNAVAILABLE",
            "Vault is not available.",
        );
    }

    const encryptedContent = await readEncryptedFile(
        result.file.storageKey,
    );

    const content = decryptFileContent(
        result.vault.id,
        result.file.id,
        {
            encryptedContent,
            encryptedDek: result.file.encryptedDek,
            encryptionNonce: result.file.encryptionNonce,
            encryptionTag: result.file.encryptionTag,
        },
        {
            encryptedDek: result.vault.encryptedDek,
            kekVersion: result.vault.kekVersion,
        },
    );

    return {
        content,
        originalName: result.file.originalName,
        sizeBytes: result.file.sizeBytes,
    };
}

export async function listVaultFilesService(input: {
    vaultId: string;
    ownerId: string;
    limit: number;
    offset: number;
}) {
    const [vault] = await db
        .select({
            id: vaults.id,
            status: vaults.status,
            expiresAt: vaults.expiresAt,
            expiryPolicy: vaults.expiryPolicy,
        })
        .from(vaults)
        .where(
            and(
                eq(vaults.id, input.vaultId),
                eq(vaults.ownerId, input.ownerId),
            ),
        )
        .limit(1);

    if (!vault) {
        throw new AppError(404, "VAULT_NOT_FOUND", "Vault not found.");
    }

    if (!canOwnerAccessVault(vault)) {
        throw new AppError(
            410,
            "VAULT_UNAVAILABLE",
            "Vault is not available.",
        );
    }

    return db
        .select({
            id: files.id,
            originalName: files.originalName,
            mimeType: files.mimeType,
            sizeBytes: files.sizeBytes,
            createdAt: files.createdAt,
        })
        .from(files)
        .where(
            and(
                eq(files.vaultId, input.vaultId),
                eq(files.status, "ACTIVE"),
            ),
        )
        .orderBy(files.createdAt)
        .limit(input.limit)
        .offset(input.offset);
}

export async function deleteFileService(input: {
    vaultId: string;
    fileId: string;
    ownerId: string;
}): Promise<void> {
    await db.transaction(async (tx) => {
        // Lock the owner-scoped vault first.
        const [vault] = await tx
            .select({
                id: vaults.id,
                status: vaults.status,
                expiryPolicy: vaults.expiryPolicy,
                expiresAt: vaults.expiresAt,
            })
            .from(vaults)
            .where(
                and(
                    eq(vaults.id, input.vaultId),
                    eq(vaults.ownerId, input.ownerId),
                ),
            )
            .for("update")
            .limit(1);

        if (!vault) {
            throw new AppError(404, "VAULT_NOT_FOUND", "Vault not found.");
        }

        if (!canOwnerAccessVault(vault)) {
            throw new AppError(
                410,
                "VAULT_UNAVAILABLE",
                "Vault is not available.",
            );
        }

        // Then lock the file within that vault.
        const [file] = await tx
            .select({
                id: files.id,
                storageKey: files.storageKey,
            })
            .from(files)
            .where(
                and(
                    eq(files.id, input.fileId),
                    eq(files.vaultId, vault.id),
                    eq(files.status, "ACTIVE"),
                ),
            )
            .for("update")
            .limit(1);

        if (!file) {
            throw new AppError(404, "FILE_NOT_FOUND", "File not found.");
        }

        await tx
            .update(files)
            .set({
                status: "DELETED",
                updatedAt: new Date(),
            })
            .where(eq(files.id, file.id));

        await tx
            .insert(cleanupJobs)
            .values({
                resourceType: "FILE_BLOB",
                resourceId: file.id,
                storageKey: file.storageKey,
            })
            .onConflictDoNothing();
    });
}
