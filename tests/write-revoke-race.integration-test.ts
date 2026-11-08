
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";

import { db, pool } from "../src/db/client.js";
import { users } from "../src/db/schema/users.js";
import { vaults } from "../src/db/schema/vaults.js";
import { shares } from "../src/db/schema/shares.js";
import { writeRequests } from "../src/db/schema/write-requests.js";
import { vaultLineage } from "../src/db/schema/vault-lineage.js";
import { cleanupJobs } from "../src/db/schema/cleanup-jobs.js";
import { notificationOutbox } from "../src/db/schema/notification-outbox.js";

import { encryptVaultContent } from "../src/infrastructure/encryption/encryption.service.js";
import { reviewWriteRequestService } from "../src/modules/shares/write-request-review.service.js";
import { revokeVaultService } from "../src/modules/vaults/vault.service.js";

async function runTrial(trial: number): Promise<void> {
    const ownerId = randomUUID();
    const readerId = randomUUID();
    const rootVaultId = randomUUID();
    const shareId = randomUUID();
    const requestId = randomUUID();

    let derivedVaultId: string | null = null;

    try {
        await db.insert(users).values([
            {
                id: ownerId,
                cognitoSub: `race-owner-${randomUUID()}`,
                email: `race-owner-${randomUUID()}@example.test`,
            },
            {
                id: readerId,
                cognitoSub: `race-reader-${randomUUID()}`,
                email: `race-reader-${randomUUID()}@example.test`,
            },
        ]);

        const encrypted = encryptVaultContent(
            requestId,
            "Proposed derived content for race test",
        );

        await db.insert(vaults).values({
            id: rootVaultId,
            ownerId,
            name: `Race test root ${trial}`,
            description: null,
            encryptedContent: "root-encrypted-content",
            encryptedDek: "root-encrypted-dek",
            encryptionNonce: "root-nonce",
            encryptionTag: "root-tag",
            status: "ACTIVE",
            overallTtlSeconds: 3600,
            firstSharedAt: null,
            expiresAt: null,
            expiryPolicy: "REVOKE_ACCESS",
        });

        await db.insert(shares).values({
            id: shareId,
            shareCode: randomUUID().replaceAll("-", "").slice(0, 32),
            vaultId: rootVaultId,
            readerId,
            permissions: ["READ", "WRITE"],
            status: "active",
            maxAccessCount: 5,
            successfulOpenCount: 0,
            postOpenTtlSeconds: null,
            firstOpenedAt: null,
            postOpenExpiresAt: null,
        });

        await db.insert(writeRequests).values({
            id: requestId,
            shareId,
            sourceVaultId: rootVaultId,
            requestedBy: readerId,
            status: "PENDING",
            encryptedContent: encrypted.encryptedContent,
            encryptedDek: encrypted.encryptedDek,
            encryptionNonce: encrypted.encryptionNonce,
            encryptionTag: encrypted.encryptionTag,
        });

        // Start both transactions together.
        const results = await Promise.allSettled([
            reviewWriteRequestService({
                requestId,
                vaultId: rootVaultId,
                ownerId,
                decision: "APPROVE",
            }),
            revokeVaultService(rootVaultId, ownerId),
        ]);

        assert.equal(
            results[1].status,
            "fulfilled",
            `Trial ${trial}: source revocation must complete`,
        );

        const [root] = await db
            .select()
            .from(vaults)
            .where(eq(vaults.id, rootVaultId));

        const [request] = await db
            .select()
            .from(writeRequests)
            .where(eq(writeRequests.id, requestId));

        assert.ok(root);
        assert.ok(request);
        assert.equal(root.status, "REVOKED");

        // Revocation must erase the pending proposal in either outcome.
        assert.equal(request.encryptedContent, "");
        assert.equal(request.encryptedDek, "");
        assert.equal(request.encryptionNonce, "");
        assert.equal(request.encryptionTag, "");

        if (request.status === "APPROVED") {
            // Approval committed first. Its derived vault must be destroyed
            // by the source vault's lineage cascade.
            assert.ok(request.derivedVaultId);
            derivedVaultId = request.derivedVaultId;

            const [derived] = await db
                .select()
                .from(vaults)
                .where(eq(vaults.id, derivedVaultId));

            assert.ok(derived);
            assert.equal(derived.status, "DESTROYED");
            assert.equal(derived.encryptedContent, "");
            assert.equal(derived.encryptedDek, "");
            assert.equal(derived.encryptionNonce, "");
            assert.equal(derived.encryptionTag, "");

            const [lineage] = await db
                .select()
                .from(vaultLineage)
                .where(eq(vaultLineage.derivedVaultId, derivedVaultId));

            assert.ok(lineage);
        } else {
            // Revocation committed first. The pending request must be rejected.
            assert.equal(request.status, "REJECTED");
            assert.equal(request.derivedVaultId, null);
        }

        const reviewNotifications = await db
            .select()
            .from(notificationOutbox)
            .where(and(
                eq(notificationOutbox.recipientUserId, readerId),
                eq(notificationOutbox.eventType, "WRITE_REQUEST_REVIEWED"),
            ));
        assert.equal(
            reviewNotifications.length,
            request.status === "APPROVED" ? 1 : 0,
            "only a successfully approved WRITE request should enqueue a review notification",
        );

        console.log(`PASS: concurrency trial ${trial}`);
    } finally {
        const vaultIds = derivedVaultId
            ? [rootVaultId, derivedVaultId]
            : [rootVaultId];

        await db.delete(cleanupJobs).where(
            and(
                eq(cleanupJobs.resourceType, "VAULT"),
                inArray(cleanupJobs.resourceId, vaultIds),
            ),
        );

        await db.delete(vaultLineage).where(
            eq(vaultLineage.sourceVaultId, rootVaultId),
        );

        await db.delete(writeRequests).where(
            eq(writeRequests.id, requestId),
        );

        await db.delete(shares).where(eq(shares.id, shareId));

        await db.delete(vaults).where(inArray(vaults.id, vaultIds));

        await db.delete(users).where(
            inArray(users.id, [ownerId, readerId]),
        );
    }
}

async function main() {
    try {
        for (let trial = 1; trial <= 3; trial++) {
            await runTrial(trial);
        }

        console.log("PASS: all WRITE approval vs revocation race trials.");
    } finally {
        await pool.end();
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
