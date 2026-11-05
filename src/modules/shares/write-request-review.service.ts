
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { db } from "../../db/client.js";
import { writeRequests } from "../../db/schema/write-requests.js";
import { vaults } from "../../db/schema/vaults.js";
import { shares } from "../../db/schema/shares.js";
import { vaultLineage } from "../../db/schema/vault-lineage.js";

import {
    decryptVaultContent,
    encryptVaultContent,
} from "../../infrastructure/encryption/encryption.service.js";

import { AppError } from "../../shared/app-error.js";

interface ReviewWriteRequestInput {
    requestId: string;
    vaultId: string;
    ownerId: string;
    decision: "APPROVE" | "REJECT";
}

export async function reviewWriteRequestService(
    input: ReviewWriteRequestInput,
) {
    return db.transaction(async (tx) => {
        const now = new Date();

        // Lock the request to prevent duplicate reviews.
        const [request] = await tx
            .select()
            .from(writeRequests)
            .where(eq(writeRequests.id, input.requestId))
            .for("update")
            .limit(1);

        if (!request) {
            throw new AppError(404, "REQUEST_NOT_FOUND", "Write request not found.");
        }

        if (request.status !== "PENDING") {
            throw new AppError(409, "REQUEST_ALREADY_REVIEWED", "This request has already been reviewed.");
        }

        if (request.sourceVaultId !== input.vaultId) {
            throw new AppError(404, "REQUEST_NOT_FOUND", "Write request not found.");
        }

        // Lock the original vault before locking the share.
        const [sourceVault] = await tx
            .select()
            .from(vaults)
            .where(eq(vaults.id, request.sourceVaultId))
            .for("update")
            .limit(1);

        if (!sourceVault || sourceVault.ownerId !== input.ownerId) {
            throw new AppError(404, "VAULT_NOT_FOUND", "Vault not found.");
        }

        if (
            sourceVault.status !== "ACTIVE" ||
            (sourceVault.expiresAt && sourceVault.expiresAt <= now)
        ) {
            throw new AppError(410, "VAULT_UNAVAILABLE", "The original vault is no longer active.");
        }

        // Rejection remains possible even if the originating share was revoked.
        if (input.decision === "REJECT") {
            const [updated] = await tx
                .update(writeRequests)
                .set({
                    status: "REJECTED",
                    reviewedBy: input.ownerId,
                    reviewedAt: now,
                })
                .where(eq(writeRequests.id, request.id))
                .returning({
                    id: writeRequests.id,
                    status: writeRequests.status,
                    reviewedAt: writeRequests.reviewedAt,
                });

            return updated;
        }

        // Approval requires the originating share to remain valid.
        // Lock order: request -> vault -> share.
        const [share] = await tx
            .select()
            .from(shares)
            .where(
                and(
                    eq(shares.id, request.shareId),
                    eq(shares.vaultId, sourceVault.id),
                    eq(shares.readerId, request.requestedBy),
                ),
            )
            .for("update")
            .limit(1);

        if (!share || share.status !== "active") {
            throw new AppError(
                409,
                "SHARE_UNAVAILABLE",
                "The originating share is no longer active.",
            );
        }

        if (!share.permissions.includes("WRITE")) {
            throw new AppError(
                403,
                "WRITE_PERMISSION_REQUIRED",
                "The originating share does not grant WRITE permission.",
            );
        }

        if (
            share.postOpenExpiresAt &&
            share.postOpenExpiresAt <= now
        ) {
            throw new AppError(
                410,
                "SHARE_EXPIRED",
                "The originating share has expired.",
            );
        }

        // Decrypt the proposed content using the request ID as its encryption context.
        const proposedContent = decryptVaultContent(request.id, {
            encryptedContent: request.encryptedContent,
            encryptedDek: request.encryptedDek,
            encryptionNonce: request.encryptionNonce,
            encryptionTag: request.encryptionTag,
        });

        // Generate a completely independent derived vault.
        const derivedVaultId = randomUUID();
        const encrypted = encryptVaultContent(derivedVaultId, proposedContent);

        const [derivedVault] = await tx
            .insert(vaults)
            .values({
                id: derivedVaultId,
                ownerId: request.requestedBy,
                folderId: null,
                name: `${sourceVault.name} (copy)`.slice(0, 150),
                description: "Approved derived copy",
                encryptedContent: encrypted.encryptedContent,
                encryptedDek: encrypted.encryptedDek,
                encryptionNonce: encrypted.encryptionNonce,
                encryptionTag: encrypted.encryptionTag,
                status: "ACTIVE",
                overallTtlSeconds: sourceVault.overallTtlSeconds,
                firstSharedAt: null,
                expiresAt: null,
                expiryPolicy: "DESTROY",
            })
            .returning({
                id: vaults.id,
                name: vaults.name,
            });

        await tx
            .update(writeRequests)
            .set({
                status: "APPROVED",
                reviewedBy: input.ownerId,
                reviewedAt: now,
                derivedVaultId,
            })
            .where(eq(writeRequests.id, request.id));

        await tx.insert(vaultLineage).values({
            sourceVaultId: sourceVault.id,
            derivedVaultId,
            writeRequestId: request.id,
            createdBy: input.ownerId,
        });

        return {
            requestId: request.id,
            status: "APPROVED",
            derivedVault,
            reviewedAt: now,
        };
    });
}
