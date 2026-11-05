import { and, eq, lte, isNotNull } from "drizzle-orm";
import { db } from "../../db/client.js";
import { vaults } from "../../db/schema/vaults.js";
import { shares } from "../../db/schema/shares.js";
import { cleanupJobs } from "../../db/schema/cleanup-jobs.js";

export async function processExpiredVaults(): Promise<number> {
    return db.transaction(async (tx) => {
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
                    lte(vaults.expiresAt, new Date()),
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
                        updatedAt: new Date(),
                    })
                    .where(eq(vaults.id, vault.id));

                await tx.insert(cleanupJobs).values({
                    resourceType: "VAULT",
                    resourceId: vault.id,
                }).onConflictDoNothing();
            } else {
                await tx
                    .update(vaults)
                    .set({
                        status: "REVOKED",
                        updatedAt: new Date(),
                    })
                    .where(eq(vaults.id, vault.id));
            }

            await tx
                .update(shares)
                .set({
                    status: "expired",
                    updatedAt: new Date(),
                })
                .where(eq(shares.vaultId, vault.id));
        }

        return expiredVaults.length;
    });
}