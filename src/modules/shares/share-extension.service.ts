import { and, eq } from "drizzle-orm";

import { db } from "../../db/client.js";
import { shares } from "../../db/schema/shares.js";
import { vaults } from "../../db/schema/vaults.js";
import { AppError } from "../../shared/app-error.js";

interface ExtendShareInput {
    vaultId: string;
    shareId: string;
    ownerId: string;
    additionalAccesses: number;
    extendPostOpenBySeconds?: number;
}

export async function extendShareAccessService(input: ExtendShareInput) {
    return db.transaction(async (tx) => {
        const now = new Date();
        const [vault] = await tx
            .select({
                id: vaults.id,
                status: vaults.status,
                expiresAt: vaults.expiresAt,
            })
            .from(vaults)
            .where(and(
                eq(vaults.id, input.vaultId),
                eq(vaults.ownerId, input.ownerId),
            ))
            .for("update")
            .limit(1);

        if (!vault) {
            throw new AppError(404, "VAULT_NOT_FOUND", "Vault not found.");
        }
        if (vault.status !== "ACTIVE" || (vault.expiresAt && vault.expiresAt <= now)) {
            throw new AppError(410, "VAULT_UNAVAILABLE", "Vault is no longer active.");
        }

        const [share] = await tx
            .select()
            .from(shares)
            .where(and(
                eq(shares.id, input.shareId),
                eq(shares.vaultId, vault.id),
            ))
            .for("update")
            .limit(1);

        if (!share) {
            throw new AppError(404, "SHARE_NOT_FOUND", "Share not found.");
        }

        // A revoked share or a reader whose post-open TTL has elapsed
        // cannot be renewed. Overall vault expiry always takes priority.
        if (
            share.status === "revoked" ||
            (share.postOpenExpiresAt && share.postOpenExpiresAt <= now)
        ) {
            throw new AppError(
                410,
                "SHARE_PERMANENTLY_EXPIRED",
                "This share can no longer be renewed.",
            );
        }

        if (share.maxAccessCount + input.additionalAccesses > 1000) {
            throw new AppError(
                400,
                "ACCESS_LIMIT_TOO_LARGE",
                "The total access limit cannot exceed 1000.",
            );
        }

        const exhaustedByCount =
            share.status === "expired" &&
            share.successfulOpenCount >= share.maxAccessCount;

        if (share.status !== "active" && !exhaustedByCount) {
            throw new AppError(409, "SHARE_NOT_RENEWABLE", "Share is not renewable.");
        }

        if (
            input.extendPostOpenBySeconds !== undefined &&
            share.firstOpenedAt === null
        ) {
            throw new AppError(
                409,
                "SHARE_NOT_OPENED",
                "Post-open time can only be extended after the reader's first open.",
            );
        }

        let nextPostOpenExpiresAt = share.postOpenExpiresAt;
        let nextPostOpenTtlSeconds = share.postOpenTtlSeconds;

        if (input.extendPostOpenBySeconds !== undefined) {
            if (!nextPostOpenExpiresAt || nextPostOpenTtlSeconds === null) {
                throw new AppError(
                    409,
                    "POST_OPEN_TTL_NOT_CONFIGURED",
                    "This share has no post-open expiry to extend.",
                );
            }

            const requestedExpiry = new Date(
                nextPostOpenExpiresAt.getTime() +
                input.extendPostOpenBySeconds * 1000,
            );

            // Never extend a reader beyond the vault's overall expiry.
            nextPostOpenExpiresAt = vault.expiresAt && requestedExpiry > vault.expiresAt
                ? vault.expiresAt
                : requestedExpiry;
            nextPostOpenTtlSeconds += input.extendPostOpenBySeconds;
        }

        const [updated] = await tx
            .update(shares)
            .set({
                maxAccessCount: share.maxAccessCount + input.additionalAccesses,
                status: "active",
                postOpenExpiresAt: nextPostOpenExpiresAt,
                postOpenTtlSeconds: nextPostOpenTtlSeconds,
                updatedAt: now,
            })
            .where(eq(shares.id, share.id))
            .returning({
                id: shares.id,
                status: shares.status,
                maxAccessCount: shares.maxAccessCount,
                successfulOpenCount: shares.successfulOpenCount,
                postOpenExpiresAt: shares.postOpenExpiresAt,
            });

        return updated;
    });
}
