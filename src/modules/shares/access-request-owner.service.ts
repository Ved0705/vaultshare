
import { and, desc, eq } from "drizzle-orm";

import { db } from "../../db/client.js";
import { accessRequests } from "../../db/schema/access-requests.js";
import { users } from "../../db/schema/users.js";
import { vaults } from "../../db/schema/vaults.js";
import { AppError } from "../../shared/app-error.js";

export async function listAccessRequestsService(
    vaultId: string,
    ownerId: string,
) {
    const [vault] = await db
        .select({ id: vaults.id })
        .from(vaults)
        .where(
            and(
                eq(vaults.id, vaultId),
                eq(vaults.ownerId, ownerId),
            ),
        )
        .limit(1);

    if (!vault) {
        throw new AppError(404, "VAULT_NOT_FOUND", "Vault not found.");
    }

    return db
        .select({
            id: accessRequests.id,
            requesterId: accessRequests.requesterId,
            requesterEmail: users.email,
            message: accessRequests.message,
            status: accessRequests.status,
            requestedAt: accessRequests.requestedAt,
            reviewedAt: accessRequests.reviewedAt,
            responseMessage: accessRequests.responseMessage,
        })
        .from(accessRequests)
        .innerJoin(users, eq(accessRequests.requesterId, users.id))
        .where(eq(accessRequests.vaultId, vaultId))
        .orderBy(desc(accessRequests.requestedAt));
}

export async function reviewAccessRequestService(
    vaultId: string,
    requestId: string,
    ownerId: string,
    decision: "APPROVE" | "REJECT",
    responseMessage?: string,
) {
    return db.transaction(async (tx) => {
        const [vault] = await tx
            .select({ id: vaults.id })
            .from(vaults)
            .where(
                and(
                    eq(vaults.id, vaultId),
                    eq(vaults.ownerId, ownerId),
                ),
            )
            .for("update");

        if (!vault) {
            throw new AppError(404, "VAULT_NOT_FOUND", "Vault not found.");
        }

        const [request] = await tx
            .select({
                id: accessRequests.id,
                status: accessRequests.status,
            })
            .from(accessRequests)
            .where(
                and(
                    eq(accessRequests.id, requestId),
                    eq(accessRequests.vaultId, vaultId),
                ),
            )
            .for("update");

        if (!request) {
            throw new AppError(
                404,
                "ACCESS_REQUEST_NOT_FOUND",
                "Access request not found.",
            );
        }

        if (request.status !== "PENDING") {
            throw new AppError(
                409,
                "REQUEST_ALREADY_REVIEWED",
                "This access request is no longer pending.",
            );
        }

        const now = new Date();

        const [updated] = await tx
            .update(accessRequests)
            .set({
                status: decision === "APPROVE" ? "APPROVED" : "REJECTED",
                reviewedBy: ownerId,
                reviewedAt: now,
                responseMessage: responseMessage?.trim() || null,
                updatedAt: now,
            })
            .where(eq(accessRequests.id, requestId))
            .returning({
                id: accessRequests.id,
                status: accessRequests.status,
                reviewedBy: accessRequests.reviewedBy,
                reviewedAt: accessRequests.reviewedAt,
                responseMessage: accessRequests.responseMessage,
            });

        return updated;
    });
}
