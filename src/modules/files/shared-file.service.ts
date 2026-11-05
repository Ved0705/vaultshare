
import argon2 from "argon2";
import { and, eq } from "drizzle-orm";

import { db } from "../../db/client.js";
import { files } from "../../db/schema/files.js";
import { shares } from "../../db/schema/shares.js";
import { shareCredentials } from "../../db/schema/share-credentials.js";
import { vaults } from "../../db/schema/vaults.js";

import {
    decryptFileContent,
} from "../../infrastructure/encryption/encryption.service.js";

import {
    readEncryptedFile,
} from "./file-storage.service.js";

import { AppError } from "../../shared/app-error.js";

interface SharedFileInput {
    shareCode: string;
    readerId: string;
    passphrase: string;
}

async function authorizeSharedFileAccess(input: SharedFileInput) {
    const [result] = await db
        .select({
            share: shares,
            credential: shareCredentials,
            vault: vaults,
        })
        .from(shares)
        .innerJoin(
            shareCredentials,
            eq(shareCredentials.shareId, shares.id),
        )
        .innerJoin(
            vaults,
            eq(vaults.id, shares.vaultId),
        )
        .where(
            and(
                eq(shares.shareCode, input.shareCode),
                eq(shares.readerId, input.readerId),
            ),
        )
        .limit(1);

    if (!result) {
        throw new AppError(404, "SHARE_NOT_FOUND", "Share not found.");
    }

    const { share, credential, vault } = result;

    // Verify share and vault availability.
    if (
        share.status !== "active" ||
        vault.status !== "ACTIVE"
    ) {
        throw new AppError(
            410,
            "SHARE_UNAVAILABLE",
            "Share is unavailable.",
        );
    }

    const now = new Date();

    // Verify overall vault expiry.
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

    // Verify reader-specific post-open expiry.
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

    // Verify passphrase.
    const validPassphrase = await argon2.verify(
        credential.passphraseHash,
        input.passphrase,
    );

    if (!validPassphrase) {
        throw new AppError(
            401,
            "INVALID_PASSPHRASE",
            "Invalid passphrase.",
        );
    }

    return { share, vault };
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
        },
    );

    return {
        content,
        originalName: file.originalName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
    };
}
