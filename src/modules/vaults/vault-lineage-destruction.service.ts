import { and, eq, inArray } from "drizzle-orm";

import { db } from "../../db/client.js";
import { vaults } from "../../db/schema/vaults.js";
import { shares } from "../../db/schema/shares.js";
import { vaultLineage } from "../../db/schema/vault-lineage.js";
import { writeRequests } from "../../db/schema/write-requests.js";
import { cleanupJobs } from "../../db/schema/cleanup-jobs.js";
import { AppError } from "../../shared/app-error.js";

type RootLifecycle = "DESTROYED" | "EXPIRED" | "REVOKED";

interface ApplyVaultLifecycleInput {
    vaultId: string;
    ownerId?: string;
    rootLifecycle: RootLifecycle;
    destroyRootPayload: boolean;
    onlyIfExpired?: boolean;
}

export async function applyVaultLifecycleService(
    input: ApplyVaultLifecycleInput,
) {
    return db.transaction(async (tx) => {
        const [root] = await tx
            .select({
                id: vaults.id,
                ownerId: vaults.ownerId,
                status: vaults.status,
                expiresAt: vaults.expiresAt,
            })
            .from(vaults)
            .where(
                input.ownerId
                    ? and(
                        eq(vaults.id, input.vaultId),
                        eq(vaults.ownerId, input.ownerId),
                    )
                    : eq(vaults.id, input.vaultId),
            )
            .for("update")
            .limit(1);

        if (!root) {
            if (input.ownerId) {
                throw new AppError(404, "VAULT_NOT_FOUND", "Vault not found.");
            }
            return { processed: false, destroyedCount: 0 };
        }

        if (
            input.onlyIfExpired &&
            (root.status !== "ACTIVE" ||
                !root.expiresAt ||
                root.expiresAt > new Date())
        ) {
            return { processed: false, destroyedCount: 0 };
        }

        // DESTROYED is terminal: a later revoke/expiry call must never
        // downgrade the state of a vault whose payload has been erased.
        if (root.status === "DESTROYED") {
            return { processed: false, destroyedCount: 0 };
        }

        const visited = new Set<string>([root.id]);
        const pending = [root.id];

        // Discover and lock every descendant before changing lifecycle state.
        while (pending.length > 0) {
            const parentId = pending.shift()!;

            const children = await tx
                .select({ id: vaultLineage.derivedVaultId })
                .from(vaultLineage)
                .where(eq(vaultLineage.sourceVaultId, parentId))
                .orderBy(vaultLineage.derivedVaultId);

            for (const child of children) {
                if (visited.has(child.id)) continue;

                const [lockedChild] = await tx
                    .select({ id: vaults.id })
                    .from(vaults)
                    .where(eq(vaults.id, child.id))
                    .for("update")
                    .limit(1);

                if (!lockedChild) continue;

                visited.add(child.id);
                pending.push(child.id);
            }
        }

        const now = new Date();
        const allVaultIds = [...visited];
        const descendantIds = allVaultIds.filter((id) => id !== root.id);

        // Destroy every descendant, irrespective of the root's retention policy.
        if (descendantIds.length > 0) {
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
                .where(inArray(vaults.id, descendantIds));
        }

        // Apply the selected lifecycle to the original.
        await tx
            .update(vaults)
            .set({
                status: input.rootLifecycle,
                ...(input.destroyRootPayload
                    ? {
                        encryptedContent: "",
                        encryptedDek: "",
                        encryptionNonce: "",
                        encryptionTag: "",
                    }
                    : {}),
                updatedAt: now,
            })
            .where(eq(vaults.id, root.id));

        // Invalidate active and pending reader shares across the lineage.
        await tx
            .update(shares)
            .set({
                status: "expired",
                updatedAt: now,
            })
            .where(
                and(
                    inArray(shares.vaultId, allVaultIds),
                    inArray(shares.status, ["active", "pending"]),
                ),
            );

        // Remove encrypted WRITE proposal payloads and reject pending proposals.
        await tx
            .update(writeRequests)
            .set({
                encryptedContent: "",
                encryptedDek: "",
                encryptionNonce: "",
                encryptionTag: "",
            })
            .where(inArray(writeRequests.sourceVaultId, allVaultIds));

        await tx
            .update(writeRequests)
            .set({
                status: "REJECTED",
                reviewedBy: root.ownerId,
                reviewedAt: now,
            })
            .where(
                and(
                    inArray(writeRequests.sourceVaultId, allVaultIds),
                    eq(writeRequests.status, "PENDING"),
                ),
            );

        // Queue physical file deletion for every destroyed vault.
        const cleanupVaultIds = input.destroyRootPayload
            ? allVaultIds
            : descendantIds;

        if (cleanupVaultIds.length > 0) {
            await tx
                .insert(cleanupJobs)
                .values(
                    cleanupVaultIds.map((resourceId) => ({
                        resourceType: "VAULT" as const,
                        resourceId,
                    })),
                )
                .onConflictDoNothing();
        }

        return {
            processed: true,
            destroyedCount: descendantIds.length +
                (input.destroyRootPayload ? 1 : 0),
        };
    });
}