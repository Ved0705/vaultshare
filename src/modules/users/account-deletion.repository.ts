
import { and, eq, inArray, or } from "drizzle-orm";

import { db } from "../../db/client.js";
import { users } from "../../db/schema/users.js";
import { vaults } from "../../db/schema/vaults.js";
import { files } from "../../db/schema/files.js";
import { cleanupJobs } from "../../db/schema/cleanup-jobs.js";
import { folders } from "../../db/schema/folders.js";
import { shares } from "../../db/schema/shares.js";
import { accessRequests } from "../../db/schema/access-requests.js";
import { writeRequests } from "../../db/schema/write-requests.js";
import { vaultLineage } from "../../db/schema/vault-lineage.js";

export async function markAccountDeletionPending(
    userId: string,
): Promise<boolean> {
    const [user] = await db
        .update(users)
        .set({
            status: "DELETION_PENDING",
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(users.id, userId),
                eq(users.status, "ACTIVE"),
            ),
        )
        .returning({ id: users.id });

    return Boolean(user);
}

export async function destroyAccountVaultData(
    userId: string,
): Promise<void> {
    await db.transaction(async (tx) => {
        const ownedVaults = await tx
            .select({ id: vaults.id })
            .from(vaults)
            .where(eq(vaults.ownerId, userId))
            .orderBy(vaults.id)
            .for("update");

        const visited = new Set(ownedVaults.map((vault) => vault.id));
        const pending = [...visited];

        // Discover every dependent derived copy.
        while (pending.length > 0) {
            const sourceVaultId = pending.shift()!;

            const children = await tx
                .select({
                    id: vaultLineage.derivedVaultId,
                })
                .from(vaultLineage)
                .where(eq(vaultLineage.sourceVaultId, sourceVaultId))
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

        const vaultIds = [...visited];

        if (vaultIds.length === 0) return;

        const now = new Date();

        // Queue file deletion before changing file records.
        const vaultFiles = await tx
            .select({
                id: files.id,
                storageKey: files.storageKey,
            })
            .from(files)
            .where(inArray(files.vaultId, vaultIds));

        for (const file of vaultFiles) {
            // Preserve the storage key in any existing cleanup job.
            await tx
                .update(cleanupJobs)
                .set({ storageKey: file.storageKey })
                .where(
                    and(
                        eq(cleanupJobs.resourceType, "FILE_BLOB"),
                        eq(cleanupJobs.resourceId, file.id),
                    ),
                );
        }

        if (vaultFiles.length > 0) {
            await tx
                .insert(cleanupJobs)
                .values(
                    vaultFiles.map((file) => ({
                        resourceType: "FILE_BLOB" as const,
                        resourceId: file.id,
                        storageKey: file.storageKey,
                    })),
                )
                .onConflictDoNothing();

            await tx
                .update(files)
                .set({
                    status: "DELETED",
                    updatedAt: now,
                })
                .where(
                    inArray(
                        files.id,
                        vaultFiles.map((file) => file.id),
                    ),
                );
        }

        // Destroy owned vaults and every dependent derived copy.
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
            .where(inArray(vaults.id, vaultIds));

        // Revoke shares attached to destroyed vaults.
        await tx
            .update(shares)
            .set({
                status: "revoked",
                revokedAt: now,
                updatedAt: now,
            })
            .where(
                and(
                    inArray(shares.vaultId, vaultIds),
                    inArray(shares.status, ["active", "pending"]),
                ),
            );

        // Clear encrypted WRITE proposal payloads for all affected sources.
        await tx
            .update(writeRequests)
            .set({
                encryptedContent: "",
                encryptedDek: "",
                encryptionNonce: "",
                encryptionTag: "",
            })
            .where(inArray(writeRequests.sourceVaultId, vaultIds));
    });
}

export async function finalizeAccountDeletion(
    userId: string,
): Promise<void> {
    await db.transaction(async (tx) => {
        const [user] = await tx
            .select({
                id: users.id,
                status: users.status,
            })
            .from(users)
            .where(eq(users.id, userId))
            .for("update")
            .limit(1);

        if (!user || user.status === "DELETED") return;

        if (user.status !== "DELETION_PENDING") {
            throw new Error("Account deletion has not been initiated.");
        }

        const ownedVaults = await tx
            .select({ id: vaults.id })
            .from(vaults)
            .where(eq(vaults.ownerId, userId));

        const vaultIds = ownedVaults.map((vault) => vault.id);

        const relevantShares = await tx
            .select({ id: shares.id })
            .from(shares)
            .where(
                vaultIds.length > 0
                    ? or(
                        eq(shares.readerId, userId),
                        inArray(shares.vaultId, vaultIds),
                    )
                    : eq(shares.readerId, userId),
            );

        const allShareIds = relevantShares.map((share) => share.id);

        // Include requests that created an owned derived vault, even when
        // their source vault belongs to another user.
        const writeRequestConditions = [
            eq(writeRequests.requestedBy, userId),
        ];

        if (vaultIds.length > 0) {
            writeRequestConditions.push(
                inArray(writeRequests.sourceVaultId, vaultIds),
                inArray(writeRequests.derivedVaultId, vaultIds),
            );
        }

        if (allShareIds.length > 0) {
            writeRequestConditions.push(
                inArray(writeRequests.shareId, allShareIds),
            );
        }

        const relevantWriteRequests = await tx
            .select({ id: writeRequests.id })
            .from(writeRequests)
            .where(or(...writeRequestConditions));

        const writeRequestIds = relevantWriteRequests.map(
            (request) => request.id,
        );

        // Remove lineage records before referenced vaults or requests.
        const lineageConditions = [
            eq(vaultLineage.createdBy, userId),
        ];

        if (vaultIds.length > 0) {
            lineageConditions.push(
                inArray(vaultLineage.sourceVaultId, vaultIds),
                inArray(vaultLineage.derivedVaultId, vaultIds),
            );
        }

        if (writeRequestIds.length > 0) {
            lineageConditions.push(
                inArray(vaultLineage.writeRequestId, writeRequestIds),
            );
        }

        await tx
            .delete(vaultLineage)
            .where(or(...lineageConditions));

        // Access requests can restrict deletion of vaults and users.
        await tx
            .delete(accessRequests)
            .where(
                vaultIds.length > 0
                    ? or(
                        eq(accessRequests.requesterId, userId),
                        inArray(accessRequests.vaultId, vaultIds),
                    )
                    : eq(accessRequests.requesterId, userId),
            );

        // Remove WRITE requests before their shares and vaults.
        if (writeRequestIds.length > 0) {
            await tx
                .delete(writeRequests)
                .where(inArray(writeRequests.id, writeRequestIds));
        }

        // Shares cascade to credentials and passphrase attempts.
        if (allShareIds.length > 0) {
            await tx
                .delete(shares)
                .where(inArray(shares.id, allShareIds));
        }

        // Delete owned vault metadata only. Other owners' destroyed
        // descendant vaults remain as tombstones.
        if (vaultIds.length > 0) {
            await tx
                .delete(files)
                .where(inArray(files.vaultId, vaultIds));

            await tx
                .delete(vaults)
                .where(inArray(vaults.id, vaultIds));
        }

        // Folders are deleted only after their vaults.
        await tx
            .delete(folders)
            .where(eq(folders.ownerId, userId));

        // Clear reviewer references in records belonging to other users.
        await tx
            .update(accessRequests)
            .set({ reviewedBy: null })
            .where(eq(accessRequests.reviewedBy, userId));

        await tx
            .update(writeRequests)
            .set({ reviewedBy: null })
            .where(eq(writeRequests.reviewedBy, userId));

        // Retain a minimal tombstone to prevent identity re-provisioning.
        await tx
            .update(users)
            .set({
                email: `deleted+${userId}@invalid.vaultshare`,
                emailVerified: false,
                status: "DELETED",
                updatedAt: new Date(),
            })
            .where(eq(users.id, userId));
    });
}
