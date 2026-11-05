
import {
    and,
    desc,
    eq,
    gt,
    isNull,
    or,
} from "drizzle-orm";

import { db } from "../../db/client.js";
import { vaults } from "../../db/schema/vaults.js";

type NewVault = typeof vaults.$inferInsert;

export interface VaultMetadataUpdate {
    name?: string;
    description?: string | null;
    folderId?: string | null;
}

/**
 * Create a new vault record.
 */
export async function createVault(data: NewVault) {
    const [vault] = await db
        .insert(vaults)
        .values(data)
        .returning();

    return vault;
}

/**
 * Find a vault belonging to a specific owner.
 * Includes encrypted content for authorized service operations.
 */
export async function findVaultByIdAndOwner(
    vaultId: string,
    ownerId: string,
) {
    const [vault] = await db
        .select()
        .from(vaults)
        .where(
            and(
                eq(vaults.id, vaultId),
                eq(vaults.ownerId, ownerId),
            ),
        )
        .limit(1);

    return vault ?? null;
}

/**
 * List an owner's vaults.
 * Deliberately excludes encrypted content and key material.
 */
export async function listVaultsByOwner(
    ownerId: string,
    limit = 20,
    offset = 0,
) {
    return db
        .select({
            id: vaults.id,
            ownerId: vaults.ownerId,
            folderId: vaults.folderId,
            name: vaults.name,
            description: vaults.description,
            status: vaults.status,
            overallTtlSeconds: vaults.overallTtlSeconds,
            firstSharedAt: vaults.firstSharedAt,
            expiresAt: vaults.expiresAt,
            expiryPolicy: vaults.expiryPolicy,
            createdAt: vaults.createdAt,
            updatedAt: vaults.updatedAt,
        })
        .from(vaults)
        .where(eq(vaults.ownerId, ownerId))
        .orderBy(desc(vaults.createdAt))
        .limit(limit)
        .offset(offset);
}

/**
 * Update vault metadata, scoped to its owner.
 * Enforces expiry and lifecycle restrictions at database level.
 */
export async function updateVaultMetadata(
    vaultId: string,
    ownerId: string,
    data: VaultMetadataUpdate,
) {
    const now = new Date();

    const [vault] = await db
        .update(vaults)
        .set({
            ...data,
            updatedAt: now,
        })
        .where(
            and(
                eq(vaults.id, vaultId),
                eq(vaults.ownerId, ownerId),

                // ACTIVE vaults, or expired/revoked REVOKE_ACCESS vaults.
                or(
                    eq(vaults.status, "ACTIVE"),
                    and(
                        eq(vaults.expiryPolicy, "REVOKE_ACCESS"),
                        or(
                            eq(vaults.status, "EXPIRED"),
                            eq(vaults.status, "REVOKED"),
                        ),
                    ),
                ),

                // DESTROY-policy vaults cannot be updated after expiry.
                or(
                    eq(vaults.expiryPolicy, "REVOKE_ACCESS"),
                    isNull(vaults.expiresAt),
                    gt(vaults.expiresAt, now),
                ),
            ),
        )
        .returning();

    return vault ?? null;
}
