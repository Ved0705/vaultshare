
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { writeRequests } from "../../db/schema/write-requests.js";
import { vaults } from "../../db/schema/vaults.js";

export async function listVaultWriteRequests(
    vaultId: string,
    ownerId: string,
    limit = 20,
    offset = 0,
) {
    const [vault] = await db
        .select({ id: vaults.id })
        .from(vaults)
        .where(and(
            eq(vaults.id, vaultId),
            eq(vaults.ownerId, ownerId),
        ))
        .limit(1);

    if (!vault) return null;

    return db
        .select({
            id: writeRequests.id,
            shareId: writeRequests.shareId,
            requestedBy: writeRequests.requestedBy,
            status: writeRequests.status,
            requestedAt: writeRequests.requestedAt,
            reviewedAt: writeRequests.reviewedAt,
        })
        .from(writeRequests)
        .where(eq(writeRequests.sourceVaultId, vaultId))
        .orderBy(desc(writeRequests.requestedAt))
        .limit(limit)
        .offset(offset);
}
