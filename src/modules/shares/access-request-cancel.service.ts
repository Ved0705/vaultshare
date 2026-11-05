
import { and, eq } from "drizzle-orm";

import { db } from "../../db/client.js";
import { accessRequests } from "../../db/schema/access-requests.js";
import { AppError } from "../../shared/app-error.js";

export async function cancelAccessRequestService(
    requestId: string,
    requesterId: string,
) {
    return db.transaction(async (tx) => {
        const [request] = await tx
            .select({
                id: accessRequests.id,
                status: accessRequests.status,
            })
            .from(accessRequests)
            .where(
                and(
                    eq(accessRequests.id, requestId),
                    eq(accessRequests.requesterId, requesterId),
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
                "REQUEST_NOT_PENDING",
                "Only pending requests can be cancelled.",
            );
        }

        const now = new Date();

        const [cancelled] = await tx
            .update(accessRequests)
            .set({
                status: "CANCELLED",
                cancelledAt: now,
                updatedAt: now,
            })
            .where(eq(accessRequests.id, requestId))
            .returning({
                id: accessRequests.id,
                status: accessRequests.status,
                cancelledAt: accessRequests.cancelledAt,
            });

        return cancelled;
    });
}
