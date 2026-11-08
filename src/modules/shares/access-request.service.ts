
import { and, eq } from "drizzle-orm";

import { db } from "../../db/client.js";
import { accessRequests } from "../../db/schema/access-requests.js";
import { shares } from "../../db/schema/shares.js";
import { notificationOutbox } from "../../db/schema/notification-outbox.js";
import { vaults } from "../../db/schema/vaults.js";
import { AppError } from "../../shared/app-error.js";

export async function createAccessRequestService(
    vaultId: string,
    requesterId: string,
    message?: string,
) {
    try {
        return await db.transaction(async (tx) => {
            const [vault] = await tx
                .select({
                    id: vaults.id,
                    ownerId: vaults.ownerId,
                    status: vaults.status,
                    expiresAt: vaults.expiresAt,
                })
                .from(vaults)
                .where(eq(vaults.id, vaultId))
                .for("update");

            if (!vault) {
                throw new AppError(404, "VAULT_NOT_FOUND", "Vault not found.");
            }

            if (vault.ownerId === requesterId) {
                throw new AppError(
                    400,
                    "OWN_VAULT_REQUEST",
                    "You cannot request access to your own vault.",
                );
            }

            if (
                vault.status !== "ACTIVE" ||
                (vault.expiresAt && vault.expiresAt <= new Date())
            ) {
                throw new AppError(
                    410,
                    "VAULT_UNAVAILABLE",
                    "This vault is no longer available for access requests.",
                );
            }

            const [existingShare] = await tx
                .select({ id: shares.id })
                .from(shares)
                .where(
                    and(
                        eq(shares.vaultId, vaultId),
                        eq(shares.readerId, requesterId),
                        eq(shares.status, "active"),
                    ),
                )
                .limit(1);

            if (existingShare) {
                throw new AppError(
                    409,
                    "ACTIVE_SHARE_EXISTS",
                    "You already have an active share for this vault.",
                );
            }

            const [request] = await tx
                .insert(accessRequests)
                .values({
                    vaultId,
                    requesterId,
                    requestType: "READ",
                    message: message?.trim() || null,
                    status: "PENDING",
                })
                .returning({
                    id: accessRequests.id,
                    vaultId: accessRequests.vaultId,
                    requesterId: accessRequests.requesterId,
                    requestType: accessRequests.requestType,
                    message: accessRequests.message,
                    status: accessRequests.status,
                    requestedAt: accessRequests.requestedAt,
                });

            await tx.insert(notificationOutbox).values({
                recipientUserId: vault.ownerId,
                eventType: "ACCESS_REQUEST_CREATED",
            });

            return request;
        });
    } catch (error) {
        if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "23505"
        ) {
            throw new AppError(
                409,
                "PENDING_REQUEST_EXISTS",
                "You already have a pending access request for this vault.",
            );
        }

        throw error;
    }
}
