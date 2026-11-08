
import { and, eq } from "drizzle-orm";

import { db } from "../../db/client.js";
import { files } from "../../db/schema/files.js";
import { shares } from "../../db/schema/shares.js";
import { vaults } from "../../db/schema/vaults.js";

import {
    decryptFileContent,
} from "../../infrastructure/encryption/encryption.service.js";

import {
    readEncryptedFile,
} from "./file-storage.service.js";

import { AppError } from "../../shared/app-error.js";
import { verifySharePassphrase } from "../shares/passphrase-verification.service.js";

interface SharedFileInput {
    shareCode: string;
    readerId: string;
    passphrase: string;
}

async function authorizeSharedFileAccess(input: SharedFileInput) {
    const result = await db.transaction(async (tx) => {
        const now = new Date();

        // Find the share to identify its vault.
        const [initialShare] = await tx
            .select()
            .from(shares)
            .where(
                and(
                    eq(shares.shareCode, input.shareCode),
                    eq(shares.readerId, input.readerId),
                ),
            )
            .limit(1);

        if (!initialShare) {
            throw new AppError(404, "SHARE_NOT_FOUND", "Share not found.");
        }

        // Lock the vault first to maintain consistent lock ordering.
        const [vault] = await tx
            .select()
            .from(vaults)
            .where(eq(vaults.id, initialShare.vaultId))
            .for("update")
            .limit(1);

        if (!vault || vault.status !== "ACTIVE") {
            throw new AppError(
                410,
                "VAULT_UNAVAILABLE",
                "Vault is unavailable.",
            );
        }

        // Lock and re-fetch the share after locking the vault.
        const [share] = await tx
            .select()
            .from(shares)
            .where(
                and(
                    eq(shares.id, initialShare.id),
                    eq(shares.shareCode, input.shareCode),
                    eq(shares.readerId, input.readerId),
                    eq(shares.vaultId, vault.id),
                ),
            )
            .for("update")
            .limit(1);

        const finalOpenSession =
            share?.status === "expired" &&
            share.firstOpenedAt !== null &&
            share.successfulOpenCount >= share.maxAccessCount;

        if (!share || (share.status !== "active" && !finalOpenSession)) {
            throw new AppError(
                410,
                "SHARE_UNAVAILABLE",
                "Share is unavailable.",
            );
        }

        // Overall vault expiry.
        if (vault.expiresAt && vault.expiresAt <= now) {
            throw new AppError(
                410,
                "SHARE_EXPIRED",
                "Share has expired.",
            );
        }

        // Reader must open the share before accessing its files.
        if (!share.firstOpenedAt) {
            throw new AppError(
                403,
                "SHARE_NOT_OPENED",
                "Open the share before accessing its files.",
            );
        }

        // Reader-specific post-open expiry.
        if (
            share.postOpenExpiresAt &&
            share.postOpenExpiresAt <= now
        ) {
            throw new AppError(
                410,
                "SHARE_EXPIRED",
                "Share access has expired.",
            );
        }

        // Verify READ permission.
        if (!share.permissions.includes("READ")) {
            throw new AppError(
                403,
                "READ_PERMISSION_REQUIRED",
                "Read permission required.",
            );
        }

        // Verify passphrase and record the attempt.
        const validPassphrase = await verifySharePassphrase({
            tx,
            shareId: share.id,
            readerId: input.readerId,
            passphrase: input.passphrase,
        });

        if (!validPassphrase) {
            return { kind: "invalid-passphrase" as const };
        }

        return {
            kind: "success" as const,
            vault,
        };
    });

    if (result.kind === "invalid-passphrase") {
        throw new AppError(
            401,
            "INVALID_PASSPHRASE",
            "Invalid passphrase.",
        );
    }

    return { vault: result.vault };
}

export async function listSharedFilesService(
    input: SharedFileInput,
) {
    const { vault } = await authorizeSharedFileAccess(input);

    const sharedFiles = await db
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
                eq(files.vaultId, vault.id),
                eq(files.status, "ACTIVE"),
            ),
        )
        .orderBy(files.createdAt);

    return sharedFiles;
}

export async function downloadSharedFileService(
    input: SharedFileInput & { fileId: string },
) {
    const { vault } = await authorizeSharedFileAccess(input);

    const [file] = await db
        .select()
        .from(files)
        .where(
            and(
                eq(files.id, input.fileId),
                eq(files.vaultId, vault.id),
                eq(files.status, "ACTIVE"),
            ),
        )
        .limit(1);

    if (!file) {
        throw new AppError(
            404,
            "FILE_NOT_FOUND",
            "File not found.",
        );
    }

    const encryptedContent = await readEncryptedFile(file.storageKey);

    const content = decryptFileContent(
        vault.id,
        file.id,
        {
            encryptedContent,
            encryptedDek: file.encryptedDek,
            encryptionNonce: file.encryptionNonce,
            encryptionTag: file.encryptionTag,
        },
        {
            encryptedDek: vault.encryptedDek,
            kekVersion: vault.kekVersion,
        },
    );

    return {
        content,
        originalName: file.originalName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
    };
}
