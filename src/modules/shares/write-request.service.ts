
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { db } from "../../db/client.js";
import { shares } from "../../db/schema/shares.js";
import { vaults } from "../../db/schema/vaults.js";
import { writeRequests } from "../../db/schema/write-requests.js";

import { encryptVaultContent } from "../../infrastructure/encryption/encryption.service.js";
import { AppError } from "../../shared/app-error.js";
import { verifySharePassphrase } from "./passphrase-verification.service.js";

interface CreateWriteRequestInput {
    shareCode: string;
    readerId: string;
    proposedContent: string;
    passphrase: string;
}

export async function createWriteRequestService(
    input: CreateWriteRequestInput,
) {
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
            throw new AppError(
                404,
                "SHARE_NOT_FOUND",
                "Share not found.",
            );
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
                "The original vault is no longer active.",
            );
        }

        // Lock and re-fetch the share after acquiring the vault lock.
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

        if (vault.expiresAt && vault.expiresAt <= now) {
            throw new AppError(
                410,
                "VAULT_EXPIRED",
                "The original vault has expired.",
            );
        }

        // Verify passphrase and record the attempt.
        const validPassphrase = await verifySharePassphrase({
            tx,
            shareId: share.id,
            readerId: input.readerId,
            passphrase: input.passphrase,
        });

        // Return instead of throwing so the failed attempt is committed.
        if (!validPassphrase) {
            return { kind: "invalid-passphrase" as const };
        }

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
