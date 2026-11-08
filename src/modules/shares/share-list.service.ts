import { and, desc, eq } from "drizzle-orm";

import { db } from "../../db/client.js";
import { shares } from "../../db/schema/shares.js";
import { users } from "../../db/schema/users.js";
import { vaults } from "../../db/schema/vaults.js";
import { AppError } from "../../shared/app-error.js";

export async function listVaultSharesService(
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
        throw new AppError(
            404,
            "VAULT_NOT_FOUND",
            "Vault not found.",
        );
    }

    const records = await db
        .select({
            id: shares.id,
            readerId: shares.readerId,
            readerEmail: users.email,
            permissions: shares.permissions,
            status: shares.status,
            maxAccessCount: shares.maxAccessCount,
            successfulOpenCount: shares.successfulOpenCount,
            sharedAt: shares.sharedAt,
            firstOpenedAt: shares.firstOpenedAt,
            postOpenTtlSeconds: shares.postOpenTtlSeconds,
            postOpenExpiresAt: shares.postOpenExpiresAt,
            revokedAt: shares.revokedAt,
        })
        .from(shares)
        .innerJoin(users, eq(shares.readerId, users.id))
        .where(eq(shares.vaultId, vaultId))
        .orderBy(desc(shares.sharedAt));

    return records;
}