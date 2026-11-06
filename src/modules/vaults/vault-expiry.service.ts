import { and, eq, lte, isNotNull } from "drizzle-orm";

import { db } from "../../db/client.js";
import { vaults } from "../../db/schema/vaults.js";

import { applyVaultLifecycleService } from "./vault-lineage-destruction.service.js";

export async function processExpiredVaults(): Promise<number> {
    const now = new Date();

    const expiredVaults = await db
        .select({
            id: vaults.id,
            expiryPolicy: vaults.expiryPolicy,
        })
        .from(vaults)
        .where(
            and(
                eq(vaults.status, "ACTIVE"),
                isNotNull(vaults.expiresAt),
                lte(vaults.expiresAt, now),
            ),
        )
        .limit(50);

    let processed = 0;

    for (const vault of expiredVaults) {
        const destroyRoot = vault.expiryPolicy === "DESTROY";

        const result = await applyVaultLifecycleService({
            vaultId: vault.id,
            rootLifecycle: destroyRoot ? "DESTROYED" : "EXPIRED",
            destroyRootPayload: destroyRoot,
            onlyIfExpired: true,
        });

        if (result.processed) {
            processed++;
        }
    }

    return processed;
}