
import { and, eq, lte, isNotNull } from "drizzle-orm";

import { db } from "../../db/client.js";
import { vaults } from "../../db/schema/vaults.js";
import { shares } from "../../db/schema/shares.js";
import { cleanupJobs } from "../../db/schema/cleanup-jobs.js";

export async function processExpiredVaults(): Promise<number> {
    return db.transaction(async (tx) => {
        const now = new Date();

        const expiredVaults = await tx
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
            .for("update", { skipLocked: true })
            .limit(50);

        for (const vault of expiredVaults) {
            if (vault.expiryPolicy === "DESTROY") {
                await tx
                    .update(vaults)
                    .set({
                        status: "DESTROYED",
                        encryptedContent: "",
                        encryptedDek: "",
                        encryptionNonce: "",
                        encryptionTag: "",
                        updatedAt: now,
                    })
                    .where(eq(vaults.id, vault.id));

                await tx
                    .insert(cleanupJobs)
                    .values({
                        resourceType: "VAULT",
                        resourceId: vault.id,
                    })
                    .onConflictDoNothing();
            } else {
                // Preserve owner access while invalidating readers.
                await tx
                    .update(vaults)
                    .set({
                        status: "EXPIRED",
                        updatedAt: now,
                    })
                    .where(eq(vaults.id, vault.id));
            }

            // Invalidate all active reader shares.
            await tx
                .update(shares)
                .set({
                    status: "expired",
                    updatedAt: now,
                })
                .where(
                    and(
                        eq(shares.vaultId, vault.id),
                        eq(shares.status, "active"),
                    ),
                );
        }

        return expiredVaults.length;
    });
}
