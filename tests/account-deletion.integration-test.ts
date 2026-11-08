
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";

import { db, pool } from "../src/db/client.js";
import { users } from "../src/db/schema/users.js";
import { vaults } from "../src/db/schema/vaults.js";
import { folders } from "../src/db/schema/folders.js";
import { files } from "../src/db/schema/files.js";
import { shares } from "../src/db/schema/shares.js";
import { accessRequests } from "../src/db/schema/access-requests.js";
import { writeRequests } from "../src/db/schema/write-requests.js";
import { vaultLineage } from "../src/db/schema/vault-lineage.js";
import { cleanupJobs } from "../src/db/schema/cleanup-jobs.js";

import {
    markAccountDeletionPending,
    destroyAccountVaultData,
    finalizeAccountDeletion,
} from "../src/modules/users/account-deletion.repository.js";

const deletingUserId = randomUUID();
const otherOwnerId = randomUUID();

const folderId = randomUUID();

const rootVaultId = randomUUID();
const descendantVaultId = randomUUID();
const externalSourceVaultId = randomUUID();
const ownedDerivedVaultId = randomUUID();

const rootFileId = randomUUID();
const descendantFileId = randomUUID();

const rootShareId = randomUUID();
const externalShareId = randomUUID();

const rootWriteRequestId = randomUUID();
const derivedWriteRequestId = randomUUID();

const accessRequestId = randomUUID();

const fixtureVaultIds = [
    rootVaultId,
    descendantVaultId,
    externalSourceVaultId,
    ownedDerivedVaultId,
];

const fixtureFileIds = [rootFileId, descendantFileId];
const fixtureShareIds = [rootShareId, externalShareId];
const fixtureWriteRequestIds = [
    rootWriteRequestId,
    derivedWriteRequestId,
];

function makeVault(
    id: string,
    ownerId: string,
    name: string,
    folderIdValue: string | null = null,
) {
    return {
        id,
        ownerId,
        folderId: folderIdValue,
        name,
        description: "Account deletion integration test",
        encryptedContent: `encrypted-content-${id}`,
        encryptedDek: `encrypted-dek-${id}`,
        encryptionNonce: "test-nonce",
        encryptionTag: "test-tag",
        status: "ACTIVE",
        overallTtlSeconds: 3600,
        firstSharedAt: null,
        expiresAt: null,
        expiryPolicy: "DESTROY",
    };
}

async function run() {
    try {
        // Two independent users.
        await db.insert(users).values([
            {
                id: deletingUserId,
                cognitoSub: `account-delete-test-${deletingUserId}`,
                email: `account-delete-${deletingUserId}@example.test`,
                emailVerified: true,
            },
            {
                id: otherOwnerId,
                cognitoSub: `account-delete-owner-${otherOwnerId}`,
                email: `account-delete-owner-${otherOwnerId}@example.test`,
                emailVerified: true,
            },
        ]);

        await db.insert(folders).values({
            id: folderId,
            ownerId: deletingUserId,
            name: "Deletion test folder",
        });

        // Root vault and an independently owned descendant.
        // Also create an external source and a derived vault owned by
        // the account being deleted.
        await db.insert(vaults).values([
            makeVault(rootVaultId, deletingUserId, "Owned root", folderId),
            makeVault(
                descendantVaultId,
                otherOwnerId,
                "Other user's descendant",
            ),
            makeVault(
                externalSourceVaultId,
                otherOwnerId,
                "Unrelated external source",
            ),
            makeVault(
                ownedDerivedVaultId,
                deletingUserId,
                "Owned derived vault",
            ),
        ]);

        await db.insert(files).values([
            {
                id: rootFileId,
                vaultId: rootVaultId,
                originalName: "root.txt",
                mimeType: "text/plain",
                sizeBytes: 10,
                storageKey: `root-${rootFileId}`,
                encryptedDek: "encrypted-file-dek",
                encryptionNonce: "file-nonce",
                encryptionTag: "file-tag",
            },
            {
                id: descendantFileId,
                vaultId: descendantVaultId,
                originalName: "descendant.txt",
                mimeType: "text/plain",
                sizeBytes: 20,
                storageKey: `child-${descendantFileId}`,
                encryptedDek: "encrypted-file-dek",
                encryptionNonce: "file-nonce",
                encryptionTag: "file-tag",
            },
        ]);

        await db.insert(shares).values([
            {
                id: rootShareId,
                shareCode: randomUUID().replaceAll("-", "").slice(0, 32),
                vaultId: rootVaultId,
                readerId: otherOwnerId,
                permissions: ["READ", "WRITE"],
                status: "active",
                maxAccessCount: 5,
            },
            {
                id: externalShareId,
                shareCode: randomUUID().replaceAll("-", "").slice(0, 32),
                vaultId: externalSourceVaultId,
                readerId: deletingUserId,
                permissions: ["READ", "WRITE"],
                status: "active",
                maxAccessCount: 5,
            },
        ]);

        const now = new Date();

        await db.insert(writeRequests).values([
            {
                id: rootWriteRequestId,
                shareId: rootShareId,
                sourceVaultId: rootVaultId,
                requestedBy: otherOwnerId,
                status: "APPROVED",
                encryptedContent: "root-derived-content",
                encryptedDek: "root-derived-dek",
                encryptionNonce: "root-derived-nonce",
                encryptionTag: "root-derived-tag",
                derivedVaultId: descendantVaultId,
                reviewedBy: deletingUserId,
                reviewedAt: now,
            },
            {
                id: derivedWriteRequestId,
                shareId: externalShareId,
                sourceVaultId: externalSourceVaultId,
                requestedBy: deletingUserId,
                status: "APPROVED",
                encryptedContent: "owned-derived-content",
                encryptedDek: "owned-derived-dek",
                encryptionNonce: "owned-derived-nonce",
                encryptionTag: "owned-derived-tag",
                derivedVaultId: ownedDerivedVaultId,
                reviewedBy: otherOwnerId,
                reviewedAt: now,
            },
        ]);

        await db.insert(vaultLineage).values([
            {
                sourceVaultId: rootVaultId,
                derivedVaultId: descendantVaultId,
                writeRequestId: rootWriteRequestId,
                createdBy: deletingUserId,
            },
            {
                sourceVaultId: externalSourceVaultId,
                derivedVaultId: ownedDerivedVaultId,
                writeRequestId: derivedWriteRequestId,
                createdBy: otherOwnerId,
            },
        ]);

        await db.insert(accessRequests).values({
            id: accessRequestId,
            vaultId: externalSourceVaultId,
            requesterId: deletingUserId,
            requestType: "READ",
            status: "PENDING",
        });

        // Begin deletion and destroy sensitive data.
        assert.equal(
            await markAccountDeletionPending(deletingUserId),
            true,
            "Active account should transition to DELETION_PENDING",
        );

        await destroyAccountVaultData(deletingUserId);

        const destroyedVaults = await db
            .select()
            .from(vaults)
            .where(inArray(vaults.id, [
                rootVaultId,
                descendantVaultId,
                ownedDerivedVaultId,
            ]));

        assert.equal(destroyedVaults.length, 3);

        for (const vault of destroyedVaults) {
            assert.equal(vault.status, "DESTROYED");
            assert.equal(vault.encryptedContent, "");
            assert.equal(vault.encryptedDek, "");
            assert.equal(vault.encryptionNonce, "");
            assert.equal(vault.encryptionTag, "");
        }

        const externalSource = await db
            .select()
            .from(vaults)
            .where(eq(vaults.id, externalSourceVaultId))
            .limit(1);

        assert.equal(externalSource.length, 1);
        assert.equal(externalSource[0].status, "ACTIVE");
        assert.equal(
            externalSource[0].encryptedContent,
            `encrypted-content-${externalSourceVaultId}`,
            "Unrelated source payload must remain intact",
        );

        const fileRows = await db
            .select()
            .from(files)
            .where(inArray(files.id, fixtureFileIds));

        assert.equal(fileRows.length, 2);
        assert.ok(fileRows.every((file) => file.status === "DELETED"));

        const fileJobs = await db
            .select()
            .from(cleanupJobs)
            .where(
                and(
                    eq(cleanupJobs.resourceType, "FILE_BLOB"),
                    inArray(cleanupJobs.resourceId, fixtureFileIds),
                ),
            );

        assert.equal(fileJobs.length, 2);

        for (const job of fileJobs) {
            const expectedStorageKey =
                job.resourceId === rootFileId
                    ? `root-${rootFileId}`
                    : `child-${descendantFileId}`;

            assert.equal(job.storageKey, expectedStorageKey);
        }

        // Finalize relational deletion and retain the user tombstone.
        await finalizeAccountDeletion(deletingUserId);

        const [deletedUser] = await db
            .select()
            .from(users)
            .where(eq(users.id, deletingUserId))
            .limit(1);

        assert.ok(deletedUser);
        assert.equal(deletedUser.status, "DELETED");
        assert.equal(deletedUser.emailVerified, false);
        assert.equal(
            deletedUser.email,
            `deleted+${deletingUserId}@invalid.vaultshare`,
        );

        const remainingOwnedVaults = await db
            .select()
            .from(vaults)
            .where(inArray(vaults.id, [
                rootVaultId,
                ownedDerivedVaultId,
            ]));

        assert.equal(
            remainingOwnedVaults.length,
            0,
            "Owned vault metadata should be deleted",
        );

        const [remainingDescendant] = await db
            .select()
            .from(vaults)
            .where(eq(vaults.id, descendantVaultId))
            .limit(1);

        assert.ok(remainingDescendant);
        assert.equal(remainingDescendant.status, "DESTROYED");
        assert.equal(remainingDescendant.encryptedContent, "");

        const [remainingExternalSource] = await db
            .select()
            .from(vaults)
            .where(eq(vaults.id, externalSourceVaultId))
            .limit(1);

        assert.ok(remainingExternalSource);
        assert.equal(remainingExternalSource.status, "ACTIVE");

        const remainingShares = await db
            .select()
            .from(shares)
            .where(inArray(shares.id, fixtureShareIds));

        assert.equal(remainingShares.length, 0);

        const remainingWriteRequests = await db
            .select()
            .from(writeRequests)
            .where(inArray(writeRequests.id, fixtureWriteRequestIds));

        assert.equal(remainingWriteRequests.length, 0);

        const remainingAccessRequests = await db
            .select()
            .from(accessRequests)
            .where(eq(accessRequests.id, accessRequestId));

        assert.equal(remainingAccessRequests.length, 0);

        const remainingLineage = await db
            .select()
            .from(vaultLineage)
            .where(
                inArray(vaultLineage.derivedVaultId, [
                    descendantVaultId,
                    ownedDerivedVaultId,
                ]),
            );

        assert.equal(remainingLineage.length, 0);

        const remainingFolders = await db
            .select()
            .from(folders)
            .where(eq(folders.id, folderId));

        assert.equal(remainingFolders.length, 0);

        // Verify retry-safe finalization.
        await finalizeAccountDeletion(deletingUserId);

        console.log("PASS: account transitions to DELETION_PENDING");
        console.log("PASS: owned vaults and all descendants are destroyed");
        console.log("PASS: unrelated source vault remains intact");
        console.log("PASS: file metadata is marked DELETED");
        console.log("PASS: cleanup jobs retain storage keys");
        console.log("PASS: owned vault metadata and folders are deleted");
        console.log("PASS: other-owner descendant remains destroyed");
        console.log("PASS: related shares, requests, and lineage are deleted");
        console.log("PASS: account is anonymized and tombstoned");
        console.log("PASS: finalization is idempotent");
        console.log("\nAccount deletion integration test passed.");
    } finally {
        // Remove only fixture records created by this test.
        await db.delete(cleanupJobs).where(
            and(
                eq(cleanupJobs.resourceType, "FILE_BLOB"),
                inArray(cleanupJobs.resourceId, fixtureFileIds),
            ),
        );

        await db.delete(vaultLineage).where(
            inArray(vaultLineage.derivedVaultId, [
                descendantVaultId,
                ownedDerivedVaultId,
            ]),
        );

        await db.delete(accessRequests).where(
            eq(accessRequests.id, accessRequestId),
        );

        await db.delete(writeRequests).where(
            inArray(writeRequests.id, fixtureWriteRequestIds),
        );

        await db.delete(shares).where(
            inArray(shares.id, fixtureShareIds),
        );

        await db.delete(files).where(
            inArray(files.id, fixtureFileIds),
        );

        await db.delete(vaults).where(
            inArray(vaults.id, fixtureVaultIds),
        );

        await db.delete(folders).where(eq(folders.id, folderId));

        await db.delete(users).where(
            inArray(users.id, [deletingUserId, otherOwnerId]),
        );

        await pool.end();
    }
}

run().catch((error) => {
    console.error("Account deletion integration test failed:", error);
    process.exitCode = 1;
});
