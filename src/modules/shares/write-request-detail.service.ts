
import { and, eq } from "drizzle-orm";

import { db } from "../../db/client.js";
import { writeRequests } from "../../db/schema/write-requests.js";
import { vaults } from "../../db/schema/vaults.js";

import { decryptVaultContent } from "../../infrastructure/encryption/encryption.service.js";
import { AppError } from "../../shared/app-error.js";

export async function getWriteRequestDetailService(
    requestId: string,
    vaultId: string,
    ownerId: string,
) {
    const [request] = await db
        .select()
        .from(writeRequests)
        .where(and(
            eq(writeRequests.id, requestId),
            eq(writeRequests.sourceVaultId, vaultId),
        ))
        .limit(1);

    if (!request) {
        throw new AppError(404, "REQUEST_NOT_FOUND", "Write request not found.");
    }

    const [vault] = await db
        .select({
            id: vaults.id,
            ownerId: vaults.ownerId,
        })
        .from(vaults)
        .where(and(
            eq(vaults.id, vaultId),
            eq(vaults.ownerId, ownerId),
        ))
        .limit(1);

    if (!vault) {
        throw new AppError(404, "VAULT_NOT_FOUND", "Vault not found.");
    }

    const proposedContent = decryptVaultContent(request.id, {
        encryptedContent: request.encryptedContent,
        encryptedDek: request.encryptedDek,
        encryptionNonce: request.encryptionNonce,
        encryptionTag: request.encryptionTag,
    });

    return {
        id: request.id,
        status: request.status,
        requestedBy: request.requestedBy,
        proposedContent,
        requestedAt: request.requestedAt,
        reviewedAt: request.reviewedAt,
    };
}
