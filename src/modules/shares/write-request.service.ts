import argon2 from "argon2";
import { randomUUID } from "node:crypto";
import { and, count, eq, gte } from "drizzle-orm";

import { db } from "../../db/client.js";
import { shares } from "../../db/schema/shares.js";
import { shareCredentials } from "../../db/schema/share-credentials.js";
import { passphraseAttempts } from "../../db/schema/passphrase-attempts.js";
import { vaults } from "../../db/schema/vaults.js";
import { writeRequests } from "../../db/schema/write-requests.js";

import { encryptVaultContent } from "../../infrastructure/encryption/encryption.service.js";
import { AppError } from "../../shared/app-error.js";

interface CreateWriteRequestInput {
    shareCode: string;
    readerId: string;
    proposedContent: string;
    passphrase: string;
}

const MAX_FAILED_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MINUTES = 15;

export async function createWriteRequestService(
    input: CreateWriteRequestInput,
) {
    const result = await db.transaction(async (tx) => {
        const now = new Date();

        // Find and lock the reader's share.
        const [share] = await tx
            .select()
            .from(shares)
            .where(
                and(
                    eq(shares.shareCode, input.shareCode),
                    eq(shares.readerId, input.readerId),
                ),
            )
            .for("update")
            .limit(1);

        if (!share) {
            throw new AppError(
                404,
                "SHARE_NOT_FOUND",
                "Share not found.",
            );
        }

        if (share.status !== "active") {
            throw new AppError(
                410,
                "SHARE_UNAVAILABLE",
                "This share is no longer active.",
            );
        }

        // WRITE permission is independent of READ permission.
        if (!share.permissions.includes("WRITE")) {
            throw new AppError(
                403,
                "WRITE_PERMISSION_REQUIRED",
                "You do not have permission to submit changes.",
            );
        }

        if (!share.firstOpenedAt) {
            throw new AppError(
                403,
                "SHARE_NOT_OPENED",
                "Open the share before submitting a write request.",
            );
        }

        if (
            share.postOpenExpiresAt &&
            share.postOpenExpiresAt <= now
        ) {
            throw new AppError(
                410,
                "SHARE_EXPIRED",
                "The share has expired.",
            );
        }

        // Lock and validate the original vault.
        const [vault] = await tx
            .select()
            .from(vaults)
            .where(eq(vaults.id, share.vaultId))
            .for("update")
            .limit(1);

        if (!vault || vault.status !== "ACTIVE") {
            throw new AppError(
                410,
                "VAULT_UNAVAILABLE",
                "The original vault is no longer active.",
            );
        }

        if (vault.expiresAt && vault.expiresAt <= now) {
            throw new AppError(
                410,
                "VAULT_EXPIRED",
                "The original vault has expired.",
            );
        }

        // Rate-limit failed passphrase attempts.
        const windowStart = new Date(
            now.getTime() - ATTEMPT_WINDOW_MINUTES * 60 * 1000,
        );

        const [attemptStats] = await tx
            .select({ total: count() })
            .from(passphraseAttempts)
            .where(
                and(
                    eq(passphraseAttempts.shareId, share.id),
                    eq(passphraseAttempts.userId, input.readerId),
                    eq(passphraseAttempts.succeeded, false),
                    gte(passphraseAttempts.attemptedAt, windowStart),
                ),
            );

        if ((attemptStats?.total ?? 0) >= MAX_FAILED_ATTEMPTS) {
            throw new AppError(
                429,
                "TOO_MANY_ATTEMPTS",
                "Too many incorrect passphrase attempts. Try again later.",
            );
        }

        // Verify the share passphrase.
        const [credential] = await tx
            .select()
            .from(shareCredentials)
            .where(eq(shareCredentials.shareId, share.id))
            .limit(1);

        if (!credential) {
            throw new AppError(
                500,
                "SHARE_CREDENTIAL_MISSING",
                "Share credentials could not be verified.",
            );
        }

        const validPassphrase = await argon2.verify(
            credential.passphraseHash,
            input.passphrase,
        );

        if (!validPassphrase) {
            await tx.insert(passphraseAttempts).values({
                shareId: share.id,
                userId: input.readerId,
                succeeded: false,
            });

            return { kind: "invalid-passphrase" as const };
        }

        await tx.insert(passphraseAttempts).values({
            shareId: share.id,
            userId: input.readerId,
            succeeded: true,
        });

        // Generate an independent encryption context for the proposal.
        const requestId = randomUUID();

        const encrypted = encryptVaultContent(
            requestId,
            input.proposedContent,
        );

        const [request] = await tx
            .insert(writeRequests)
            .values({
                id: requestId,
                shareId: share.id,
                sourceVaultId: vault.id,
                requestedBy: input.readerId,
                status: "PENDING",
                encryptedContent: encrypted.encryptedContent,
                encryptedDek: encrypted.encryptedDek,
                encryptionNonce: encrypted.encryptionNonce,
                encryptionTag: encrypted.encryptionTag,
            })
            .returning({
                id: writeRequests.id,
                shareId: writeRequests.shareId,
                sourceVaultId: writeRequests.sourceVaultId,
                status: writeRequests.status,
                requestedAt: writeRequests.requestedAt,
            });

        return {
            kind: "success" as const,
            data: request,
        };
    });

    if (result.kind === "invalid-passphrase") {
        throw new AppError(
            401,
            "INVALID_PASSPHRASE",
            "The supplied passphrase is incorrect.",
        );
    }

    return result.data;
}