
import argon2 from "argon2";
import { and, count, eq, gte, sql } from "drizzle-orm";

import { db } from "../../db/client.js";
import { shares } from "../../db/schema/shares.js";
import { shareCredentials } from "../../db/schema/share-credentials.js";
import { passphraseAttempts } from "../../db/schema/passphrase-attempts.js";
import { vaults } from "../../db/schema/vaults.js";

import { AppError } from "../../shared/app-error.js";
import { decryptVaultContent } from "../../infrastructure/encryption/encryption.service.js";

interface OpenShareInput {
    shareCode: string;
    readerId: string;
    passphrase: string;
}

const MAX_FAILED_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MINUTES = 15;

export async function openShareService(input: OpenShareInput) {
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
            throw new AppError(404, "SHARE_NOT_FOUND", "Share not found");
        }

        if (share.status !== "active") {
            throw new AppError(410, "SHARE_UNAVAILABLE", "This share is no longer available");
        }

        const [vault] = await tx
            .select()
            .from(vaults)
            .where(eq(vaults.id, share.vaultId))
            .for("update")
            .limit(1);

        if (!vault || vault.status !== "ACTIVE") {
            throw new AppError(410, "VAULT_UNAVAILABLE", "This vault is no longer available");
        }

        // Overall vault expiry always takes priority.
        if (vault.expiresAt && vault.expiresAt <= now) {
            throw new AppError(410, "VAULT_EXPIRED", "This vault has expired");
        }

        if (
            share.postOpenExpiresAt &&
            share.postOpenExpiresAt <= now
        ) {
            throw new AppError(410, "SHARE_EXPIRED", "This share has expired");
        }

        if (share.successfulOpenCount >= share.maxAccessCount) {
            throw new AppError(410, "ACCESS_LIMIT_REACHED", "The access limit has been reached");
        }

        // Check failed passphrase attempts in the rolling time window.
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
                "TOO_MANY_PASSPHRASE_ATTEMPTS",
                "Too many incorrect passphrase attempts. Try again later.",
            );
        }

        const [credential] = await tx
            .select()
            .from(shareCredentials)
            .where(eq(shareCredentials.shareId, share.id))
            .limit(1);

        if (!credential) {
            throw new AppError(500, "SHARE_CREDENTIAL_MISSING", "Share credentials are unavailable");
        }

        const isValid = await argon2.verify(
            credential.passphraseHash,
            input.passphrase,
        );

        if (!isValid) {
            // Return instead of throwing so this failed attempt is committed.
            await tx.insert(passphraseAttempts).values({
                shareId: share.id,
                userId: input.readerId,
                succeeded: false,
            });

            return { kind: "invalid-passphrase" as const };
        }

        // Successful passphrase verification.
        const firstOpen = share.firstOpenedAt === null;

        const postOpenExpiresAt =
            firstOpen && share.postOpenTtlSeconds !== null
                ? new Date(
                    now.getTime() + share.postOpenTtlSeconds * 1000,
                )
                : share.postOpenExpiresAt;

        await tx
            .update(shares)
            .set({
                successfulOpenCount: sql`${shares.successfulOpenCount} + 1`,
                firstOpenedAt: share.firstOpenedAt ?? now,
                postOpenExpiresAt,
                updatedAt: now,
            })
            .where(eq(shares.id, share.id));

        await tx.insert(passphraseAttempts).values({
            shareId: share.id,
            userId: input.readerId,
            succeeded: true,
        });

        const canRead = share.permissions.includes("READ");
        const canWrite = share.permissions.includes("WRITE");

        // Never return original content to WRITE-only readers.
        const content = canRead
            ? decryptVaultContent(vault.id, {
                encryptedContent: vault.encryptedContent,
                encryptedDek: vault.encryptedDek,
                encryptionNonce: vault.encryptionNonce,
                encryptionTag: vault.encryptionTag,
            })
            : undefined;

        return {
            kind: "success" as const,
            data: {
                shareId: share.id,
                shareCode: share.shareCode,
                permissions: share.permissions,
                successfulOpenCount: share.successfulOpenCount + 1,
                remainingAccesses: share.maxAccessCount - share.successfulOpenCount - 1,
                content,
                canRequestWrite: canWrite,
                postOpenExpiresAt,
                vaultExpiresAt: vault.expiresAt,
            },
        };
    });

    if (result.kind === "invalid-passphrase") {
        throw new AppError(
            401,
            "INVALID_PASSPHRASE",
            "The passphrase is incorrect",
        );
    }

    return result.data;
}
