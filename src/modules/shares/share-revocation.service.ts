
import { and, eq } from "drizzle-orm";

import { db } from "../../db/client.js";
import { shares } from "../../db/schema/shares.js";
import { vaults } from "../../db/schema/vaults.js";
import { AppError } from "../../shared/app-error.js";

export async function revokeShareService(
    vaultId: string,
    shareId: string,
    ownerId: string,
) {
    return db.transaction(async (tx) => {
        // Lock the vault and verify ownership.
        const [vault] = await tx
            .select({
                id: vaults.id,
                status: vaults.status,
            })
            .from(vaults)
            .where(
                and(
                    eq(vaults.id, vaultId),
                    eq(vaults.ownerId, ownerId),
                ),
            )
            .for("update");

        if (!vault) {
            throw new AppError(404, "VAULT_NOT_FOUND", "Vault not found.");
        }

        if (vault.status !== "ACTIVE") {
            throw new AppError(
                409,
                "VAULT_NOT_ACTIVE",
                "Shares cannot be revoked through this operation for an inactive vault.",
            );
        }

        const [share] = await tx
            .select({
                id: shares.id,
                status: shares.status,
            })
            .from(shares)
            .where(
                and(
                    eq(shares.id, shareId),
                    eq(shares.vaultId, vaultId),
                ),
            )
            .for("update");

        if (!share) {
            throw new AppError(404, "SHARE_NOT_FOUND", "Share not found.");
        }

        if (share.status !== "active") {
            throw new AppError(
                409,
                "SHARE_NOT_ACTIVE",
                "This share is no longer active.",
            );
        }

        const [revokedShare] = await tx
            .update(shares)
            .set({
                status: "revoked",
                revokedAt: new Date(),
                updatedAt: new Date(),
            })
            .where(eq(shares.id, shareId))
            .returning({
                id: shares.id,
                status: shares.status,
                revokedAt: shares.revokedAt,
            });

        return revokedShare;
    });
}

export async function revokeAllSharesService(
    vaultId: string,
    ownerId: string,
) {
    return db.transaction(async (tx) => {
        const [vault] = await tx
            .select({
                id: vaults.id,
                status: vaults.status,
            })
            .from(vaults)
            .where(
                and(
                    eq(vaults.id, vaultId),
                    eq(vaults.ownerId, ownerId),
                ),
            )
            .for("update");

        if (!vault) {
            throw new AppError(404, "VAULT_NOT_FOUND", "Vault not found.");
        }

        if (vault.status !== "ACTIVE") {
            throw new AppError(
                409,
                "VAULT_NOT_ACTIVE",
                "Shares cannot be revoked for an inactive vault.",
            );
        }

        const now = new Date();

        const revokedShares = await tx
            .update(shares)
            .set({
                status: "revoked",
                revokedAt: now,
                updatedAt: now,
            })
            .where(
                and(
                    eq(shares.vaultId, vaultId),
                    eq(shares.status, "active"),
                ),
            )
            .returning({ id: shares.id });

        return {
            revokedCount: revokedShares.length,
        };
    });
}
