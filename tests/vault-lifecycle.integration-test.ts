import { processExpiredVaults } from "../src/modules/vaults/vault-expiry.service.js";
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
import { revokeVaultService } from "../src/modules/vaults/vault.service.js";

function makeVault(ownerId: string, id: string, name: string) {
    return {
        id,
        ownerId,
        name,
        description: "Lifecycle integration test fixture",
        encryptedContent: `encrypted-content-${id}`,
        encryptedDek: `encrypted-dek-${id}`,
        encryptionNonce: "test-nonce",
        encryptionTag: "test-tag",
        status: "ACTIVE",
        overallTtlSeconds: 3600,
        firstSharedAt: null,
        expiresAt: null,
        expiryPolicy: "REVOKE_ACCESS",
    };
}

async function run() {
    const ownerId = randomUUID();
    const rootId = randomUUID();
    const childId = randomUUID();
    const grandchildId = randomUUID();

    const rootShareId = randomUUID();
    const childShareId = randomUUID();
    const pendingShareId = randomUUID();

    const childRequestId = randomUUID();
    const grandchildRequestId = randomUUID();
    const pendingRequestId = randomUUID();

    const fixtureVaultIds = [rootId, childId, grandchildId];

    try {
        await db.insert(users).values({
            id: ownerId,
            cognitoSub: `lifecycle-test-${ownerId}`,
            email: `lifecycle-${ownerId}@example.test`,
            emailVerified: true,
        });

        await db.insert(vaults).values([
            makeVault(ownerId, rootId, "Test root"),
            makeVault(ownerId, childId, "Test child"),
            makeVault(ownerId, grandchildId, "Test grandchild"),
        ]);

        await db.insert(shares).values([
            {
                id: rootShareId,
                shareCode: randomUUID().replaceAll("-", "").slice(0, 32),
                vaultId: rootId,
                readerId: ownerId,
                permissions: ["READ", "WRITE"],
                status: "active",
                maxAccessCount: 5,
            },
            {
                id: childShareId,
                shareCode: randomUUID().replaceAll("-", "").slice(0, 32),
                vaultId: childId,
                readerId: ownerId,
                permissions: ["READ", "WRITE"],
                status: "active",
                maxAccessCount: 5,
            },
            {
                id: pendingShareId,
                shareCode: randomUUID().replaceAll("-", "").slice(0, 32),
                vaultId: grandchildId,
                readerId: ownerId,
                permissions: ["READ", "WRITE"],
                status: "pending",
                maxAccessCount: 5,
            },
        ]);

        const now = new Date();

        await db.insert(writeRequests).values([
            {
                id: childRequestId,
                shareId: rootShareId,
                sourceVaultId: rootId,
                requestedBy: ownerId,
                status: "APPROVED",
                encryptedContent: "approved-child-content",
                encryptedDek: "approved-child-dek",
                encryptionNonce: "child-nonce",
                encryptionTag: "child-tag",
                derivedVaultId: childId,
                reviewedBy: ownerId,
                reviewedAt: now,
            },
            {
                id: grandchildRequestId,
                shareId: childShareId,
                sourceVaultId: childId,
                requestedBy: ownerId,
                status: "APPROVED",
                encryptedContent: "approved-grandchild-content",
                encryptedDek: "approved-grandchild-dek",
                encryptionNonce: "grandchild-nonce",
                encryptionTag: "grandchild-tag",
                derivedVaultId: grandchildId,
                reviewedBy: ownerId,
                reviewedAt: now,
            },
            {
                id: pendingRequestId,
                shareId: pendingShareId,
                sourceVaultId: grandchildId,
                requestedBy: ownerId,
                status: "PENDING",
                encryptedContent: "pending-proposal-content",
                encryptedDek: "pending-proposal-dek",
                encryptionNonce: "pending-nonce",
                encryptionTag: "pending-tag",
            },
        ]);

        await db.insert(vaultLineage).values([
            {
                sourceVaultId: rootId,
                derivedVaultId: childId,
                writeRequestId: childRequestId,
                createdBy: ownerId,
            },
            {
                sourceVaultId: childId,
                derivedVaultId: grandchildId,
                writeRequestId: grandchildRequestId,
                createdBy: ownerId,
            },
        ]);

        await revokeVaultService(rootId, ownerId);

        const result = await db
            .select()
            .from(vaults)
            .where(inArray(vaults.id, fixtureVaultIds));

        const root = result.find((v) => v.id === rootId);
        const child = result.find((v) => v.id === childId);
        const grandchild = result.find((v) => v.id === grandchildId);

        assert.ok(root, "Root vault should exist");
        assert.ok(child, "Child vault should exist");
        assert.ok(grandchild, "Grandchild vault should exist");

        // Root is revoked, but its encrypted payload is retained.
        assert.equal(root.status, "REVOKED");
        assert.equal(root.encryptedContent, `encrypted-content-${rootId}`);
        assert.equal(root.encryptedDek, `encrypted-dek-${rootId}`);

        // Every descendant must be destroyed and have its payload cleared.
        for (const descendant of [child, grandchild]) {
            assert.equal(descendant.status, "DESTROYED");
            assert.equal(descendant.encryptedContent, "");
            assert.equal(descendant.encryptedDek, "");
            assert.equal(descendant.encryptionNonce, "");
            assert.equal(descendant.encryptionTag, "");
        }

        const resultingShares = await db
            .select()
            .from(shares)
            .where(inArray(shares.vaultId, fixtureVaultIds));

        assert.equal(resultingShares.length, 3);
        assert.ok(
            resultingShares.every((share) => share.status === "expired"),
            "All lineage shares should be expired",
        );

        const resultingRequests = await db
            .select()
            .from(writeRequests)
            .where(inArray(writeRequests.id, [
                childRequestId,
                grandchildRequestId,
                pendingRequestId,
            ]));

        assert.equal(resultingRequests.length, 3);

        for (const request of resultingRequests) {
            assert.equal(request.encryptedContent, "");
            assert.equal(request.encryptedDek, "");
            assert.equal(request.encryptionNonce, "");
            assert.equal(request.encryptionTag, "");
        }

        const pendingRequest = resultingRequests.find(
            (request) => request.id === pendingRequestId,
        );

        assert.ok(pendingRequest);
        assert.equal(pendingRequest.status, "REJECTED");
        assert.equal(pendingRequest.reviewedBy, ownerId);
        assert.ok(pendingRequest.reviewedAt);

        const jobs = await db
            .select()
            .from(cleanupJobs)
            .where(
                and(
                    eq(cleanupJobs.resourceType, "VAULT"),
                    inArray(cleanupJobs.resourceId, fixtureVaultIds),
                ),
            );

        assert.deepEqual(
            new Set(jobs.map((job) => job.resourceId)),
            new Set([childId, grandchildId]),
            "Cleanup jobs should be queued for destroyed descendants only",
        );

        console.log("PASS: source revocation preserves root payload");
        console.log("PASS: all descendant generations are destroyed");
        console.log("PASS: all lineage shares are expired");
        console.log("PASS: WRITE proposal payloads are cleared");
        console.log("PASS: pending WRITE requests are rejected");
        console.log("PASS: cleanup jobs are queued for descendants");
        console.log("\nVault lifecycle integration test passed.");
        // Second scenario: DESTROY expiry policy.
        // Reset the same fixture graph to ACTIVE and make the root expired.
        const expiryTime = new Date(Date.now() - 60 * 60 * 1000);
        const firstSharedTime = new Date(
            expiryTime.getTime() - 3600 * 1000,
        );

        for (const id of fixtureVaultIds) {
            await db
                .update(vaults)
                .set({
                    status: "ACTIVE",
                    encryptedContent: `encrypted-content-${id}`,
                    encryptedDek: `encrypted-dek-${id}`,
                    encryptionNonce: "test-nonce",
                    encryptionTag: "test-tag",
                    expiryPolicy: "DESTROY",
                    firstSharedAt: firstSharedTime,
                    expiresAt: expiryTime,
                    updatedAt: new Date(),
                })
                .where(eq(vaults.id, id));
        }

        await db
            .update(shares)
            .set({ status: "active", updatedAt: new Date() })
            .where(inArray(shares.id, [
                rootShareId,
                childShareId,
                pendingShareId,
            ]));


        await db.delete(cleanupJobs).where(
            and(
                eq(cleanupJobs.resourceType, "VAULT"),
                inArray(cleanupJobs.resourceId, fixtureVaultIds),
            ),
        );

        await processExpiredVaults();

        const destroyedVaults = await db
            .select()
            .from(vaults)
            .where(inArray(vaults.id, fixtureVaultIds));

        assert.equal(destroyedVaults.length, 3);

        for (const vault of destroyedVaults) {
            assert.equal(vault.status, "DESTROYED");
            assert.equal(vault.encryptedContent, "");
            assert.equal(vault.encryptedDek, "");
            assert.equal(vault.encryptionNonce, "");
            assert.equal(vault.encryptionTag, "");
        }

        const destroyJobs = await db
            .select()
            .from(cleanupJobs)
            .where(
                and(
                    eq(cleanupJobs.resourceType, "VAULT"),
                    inArray(cleanupJobs.resourceId, fixtureVaultIds),
                ),
            );

        assert.deepEqual(
            new Set(destroyJobs.map((job) => job.resourceId)),
            new Set(fixtureVaultIds),
        );

        console.log("PASS: DESTROY expiry permanently destroys root and descendants");
        console.log("PASS: encrypted payloads cleared across all generations");
        console.log("PASS: cleanup jobs queued for root and descendants");
    } finally {
        // Remove only rows created by this test.
        await db.delete(cleanupJobs).where(
            and(
                eq(cleanupJobs.resourceType, "VAULT"),
                inArray(cleanupJobs.resourceId, fixtureVaultIds),
            ),
        );

        await db.delete(vaultLineage).where(
            inArray(vaultLineage.derivedVaultId, fixtureVaultIds),
        );

        await db.delete(writeRequests).where(
            inArray(writeRequests.id, [
                childRequestId,
                grandchildRequestId,
                pendingRequestId,
            ]),
        );

        await db.delete(shares).where(
            inArray(shares.id, [
                rootShareId,
                childShareId,
                pendingShareId,
            ]),
        );

        await db.delete(vaults).where(
            inArray(vaults.id, fixtureVaultIds),
        );

        await db.delete(users).where(eq(users.id, ownerId));
        await pool.end();
    }
}

run().catch((error) => {
    console.error("Vault lifecycle integration test failed:", error);
    process.exitCode = 1;
});
