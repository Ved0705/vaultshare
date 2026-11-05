
import { db } from "../../db/client.js";
import { and, eq, sql } from "drizzle-orm";

import { shares } from "../../db/schema/shares.js";
import { vaults } from "../../db/schema/vaults.js";

import { AppError } from "../../shared/app-error.js";

import { decryptVaultContent } from "../../infrastructure/encryption/encryption.service.js";
import { verifySharePassphrase } from "./passphrase-verification.service.js";

interface OpenShareInput {
    shareCode: string;
    readerId: string;
    passphrase: string;
}

export async function openShareService(input: OpenShareInput) {
    const result = await db.transaction(async (tx) => {
        const now = new Date();

        // Read the share without locking to discover its vault ID.
        const [initialShare] = await tx
            .select({
                id: shares.id,
                vaultId: shares.vaultId,
            })
            .from(shares)
            .where(
                and(
                    eq(shares.shareCode, input.shareCode),
                    eq(shares.readerId, input.readerId),
                ),
            )
            .limit(1);

        if (!initialShare) {
            throw new AppError(404, "SHARE_NOT_FOUND", "Share not found");
        }

        // Always lock the vault before locking its share.
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
                "This vault is no longer available",
            );
        }

        // Re-fetch and lock the share after acquiring the vault lock.
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

        if (!share) {
            throw new AppError(404, "SHARE_NOT_FOUND", "Share not found");
        }

        if (share.status !== "active") {
            throw new AppError(
                410,
                "SHARE_UNAVAILABLE",
                "This share is no longer available",
            );
        }

        // Overall vault expiry always takes priority.
        if (vault.expiresAt && vault.expiresAt <= now) {
            throw new AppError(
                410,
                "VAULT_EXPIRED",
                "This vault has expired",
            );
        }

        if (
            share.postOpenExpiresAt &&
            share.postOpenExpiresAt <= now
        ) {
            throw new AppError(
                410,
                "SHARE_EXPIRED",
                "This share has expired",
            );
        }

        if (share.successfulOpenCount >= share.maxAccessCount) {
            throw new AppError(
                410,
                "ACCESS_LIMIT_REACHED",
                "The access limit has been reached",
            );
        }

        // Verify passphrase and record the attempt.
        const isValid = await verifySharePassphrase({
            tx,
            shareId: share.id,
            readerId: input.readerId,
            passphrase: input.passphrase,
        });

        // Return instead of throwing so the failed attempt is committed.
        if (!isValid) {
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
                remainingAccesses:
                    share.maxAccessCount - share.successfulOpenCount - 1,
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
