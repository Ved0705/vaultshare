
import argon2 from "argon2";
import { and, eq, isNull, isNotNull, lte } from "drizzle-orm";

import { db } from "../../db/client.js";
import { users } from "../../db/schema/users.js";
import { vaults } from "../../db/schema/vaults.js";
import { shares } from "../../db/schema/shares.js";
import { shareCredentials } from "../../db/schema/share-credentials.js";

import { AppError } from "../../shared/app-error.js";
import { generateShareId } from "./share-id.js";

interface CreateShareInput {
    vaultId: string;
    ownerId: string;
    readerId: string;
    permissions: ("READ" | "WRITE")[];
    maxAccessCount: number;
    postOpenTtlSeconds: number | null;
    passphrase: string;
}

export async function createShareService(input: CreateShareInput) {
    if (input.ownerId === input.readerId) {
        throw new AppError(
            400,
            "INVALID_READER",
            "You cannot share a vault with yourself",
        );
    }

    return db.transaction(async (tx) => {
        // 1. Lock the vault to serialize simultaneous share creation.
        const [vault] = await tx
            .select()
            .from(vaults)
            .where(
                and(
                    eq(vaults.id, input.vaultId),
                    eq(vaults.ownerId, input.ownerId),
                ),
            )
            .for("update")
            .limit(1);

        if (!vault) {
            throw new AppError(
                404,
                "VAULT_NOT_FOUND",
                "Vault not found",
            );
        }

        if (vault.status !== "ACTIVE") {
            throw new AppError(
                409,
                "VAULT_NOT_SHAREABLE",
                "Only active vaults can be shared",
            );
        }

        const now = new Date();

        if (vault.expiresAt && vault.expiresAt <= now) {
            throw new AppError(
                410,
                "VAULT_EXPIRED",
                "This vault has expired",
            );
        }

        // 2. Verify the reader exists and has a verified email.
        const [reader] = await tx
            .select()
            .from(users)
            .where(eq(users.id, input.readerId))
            .limit(1);

        if (!reader || !reader.emailVerified) {
            throw new AppError(
                404,
                "READER_NOT_FOUND",
                "Verified reader account not found",
            );
        }

        // A reader whose post-open TTL has expired must never regain
        // access to this vault, even if the owner attempts to create a new share.
        const [priorExpiredShare] = await tx
            .select({ id: shares.id })
            .from(shares)
            .where(
                and(
                    eq(shares.vaultId, vault.id),
                    eq(shares.readerId, reader.id),
                    isNotNull(shares.firstOpenedAt),
                    isNotNull(shares.postOpenExpiresAt),
                    lte(shares.postOpenExpiresAt, now),
                ),
            )
            .limit(1);

        if (priorExpiredShare) {
            throw new AppError(
                410,
                "READER_ACCESS_PERMANENTLY_EXPIRED",
                "This reader's access to the vault has permanently expired.",
            );
        }

        const [exhaustedPriorShare] = await tx
            .select({ id: shares.id })
            .from(shares)
            .where(
                and(
                    eq(shares.vaultId, vault.id),
                    eq(shares.readerId, reader.id),
                    eq(shares.status, "expired"),
                ),
            )
            .limit(1);

        if (exhaustedPriorShare) {
            throw new AppError(
                409,
                "SHARE_ACCESS_EXHAUSTED",
                "Extend the existing share's access count instead of creating a replacement share.",
            );
        }

        // 3. Prevent duplicate active shares.
        const [existingShare] = await tx
            .select({ id: shares.id })
            .from(shares)
            .where(
                and(
                    eq(shares.vaultId, vault.id),
                    eq(shares.readerId, reader.id),
                    eq(shares.status, "active"),
                ),
            )
            .limit(1);

        if (existingShare) {
            throw new AppError(
                409,
                "ACTIVE_SHARE_EXISTS",
                "An active share already exists for this reader",
            );
        }

        // 4. Generate the Argon2id verifier after validation.
        const passphraseHash = await argon2.hash(input.passphrase, {
            type: argon2.argon2id,
            memoryCost: 19456,
            timeCost: 2,
            parallelism: 1,
        });

        // 5. Initialize overall TTL only on the first share.
        if (!vault.firstSharedAt) {
            const expiresAt = new Date(
                now.getTime() + vault.overallTtlSeconds * 1000,
            );

            await tx
                .update(vaults)
                .set({
                    firstSharedAt: now,
                    expiresAt,
                    updatedAt: now,
                })
                .where(
                    and(
                        eq(vaults.id, vault.id),
                        isNull(vaults.firstSharedAt),
                    ),
                );
        }

        // 6. Create the share.
        const [share] = await tx
            .insert(shares)
            .values({
                vaultId: vault.id,
                readerId: reader.id,
                shareCode: generateShareId(),
                permissions: input.permissions,
                status: "active",
                maxAccessCount: input.maxAccessCount,
                successfulOpenCount: 0,
                postOpenTtlSeconds: input.postOpenTtlSeconds,
            })
            .returning();

        if (!share) {
            throw new AppError(
                500,
                "SHARE_CREATION_FAILED",
                "Could not create share",
            );
        }

        // 7. Store only the Argon2id verifier.
        await tx
            .insert(shareCredentials)
            .values({
                shareId: share.id,
                passphraseHash,
            });

        // 8. Return safe metadata only.
        return {
            id: share.id,
            shareCode: share.shareCode,
            vaultId: share.vaultId,
            readerId: share.readerId,
            permissions: share.permissions,
            status: share.status,
            maxAccessCount: share.maxAccessCount,
            successfulOpenCount: share.successfulOpenCount,
            postOpenTtlSeconds: share.postOpenTtlSeconds,
            sharedAt: share.sharedAt,
        };
    });
}
