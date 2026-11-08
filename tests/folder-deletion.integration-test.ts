import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

import { db, pool } from "../src/db/client.js";
import { users } from "../src/db/schema/users.js";
import { folders } from "../src/db/schema/folders.js";
import { vaults } from "../src/db/schema/vaults.js";
import {
    createFolderService,
    deleteFolderService,
    listFoldersService,
    updateFolderService,
} from "../src/modules/folders/folder.service.js";

const ownerId = randomUUID();
const otherOwnerId = randomUUID();
const folderId = randomUUID();
const vaultId = randomUUID();

async function run() {
    try {
        await db.insert(users).values({
            id: ownerId,
            cognitoSub: `folder-delete-${ownerId}`,
            email: `folder-delete-${ownerId}@example.test`,
            emailVerified: true,
        });
        await db.insert(users).values({
            id: otherOwnerId,
            cognitoSub: `folder-delete-other-${otherOwnerId}`,
            email: `folder-delete-other-${otherOwnerId}@example.test`,
            emailVerified: true,
        });

        const created = await createFolderService(ownerId, "Initial folder");
        assert.equal(created.name, "Initial folder");
        const listed = await listFoldersService(ownerId);
        assert.ok(listed.some((folder) => folder.id === created.id));
        assert.equal((await listFoldersService(otherOwnerId)).some((folder) => folder.id === created.id), false);
        const updated = await updateFolderService(created.id, ownerId, "Renamed folder");
        assert.equal(updated.name, "Renamed folder");
        await assert.rejects(
            updateFolderService(created.id, otherOwnerId, "Unauthorized rename"),
            (error: unknown) => (error as { statusCode?: number }).statusCode === 404,
        );
        assert.equal((await listFoldersService(ownerId)).find((folder) => folder.id === created.id)?.name, "Renamed folder");
        await db.delete(folders).where(eq(folders.id, created.id));
        console.log("PASS: folder create/list/update are owner-scoped");

        await db.insert(folders).values({ id: folderId, ownerId, name: "Folder deletion test" });
        await db.insert(vaults).values({
            id: vaultId,
            ownerId,
            folderId,
            name: "Vault survives folder deletion",
            description: "Folder deletion must not destroy vault data",
            encryptedContent: "encrypted-content-retained",
            encryptedDek: "encrypted-dek-retained",
            encryptionNonce: "nonce-retained",
            encryptionTag: "tag-retained",
            status: "ACTIVE",
            overallTtlSeconds: 3600,
            expiryPolicy: "DESTROY",
        });

        await assert.rejects(
            deleteFolderService(folderId, otherOwnerId),
            (error: unknown) => (error as { statusCode?: number }).statusCode === 404,
            "a different owner must not delete this folder",
        );

        const [folderAfterDeniedAttempt] = await db.select().from(folders).where(eq(folders.id, folderId));
        assert.ok(folderAfterDeniedAttempt, "folder must remain after cross-user denial");
        const [vaultAfterDeniedAttempt] = await db.select().from(vaults).where(eq(vaults.id, vaultId));
        assert.ok(vaultAfterDeniedAttempt);
        assert.equal(vaultAfterDeniedAttempt.folderId, folderId);
        assert.equal(vaultAfterDeniedAttempt.encryptedContent, "encrypted-content-retained");

        const result = await deleteFolderService(folderId, ownerId);
        assert.deepEqual(result, { deleted: true, detachedVaultCount: 1 });
        const [remainingFolder] = await db.select().from(folders).where(eq(folders.id, folderId));
        assert.equal(remainingFolder, undefined);
        const [remainingVault] = await db.select().from(vaults).where(eq(vaults.id, vaultId));
        assert.ok(remainingVault);
        assert.equal(remainingVault.folderId, null);
        assert.equal(remainingVault.status, "ACTIVE");
        assert.equal(remainingVault.encryptedContent, "encrypted-content-retained");

        console.log("PASS: cross-user folder deletion is denied without mutation");
        console.log("PASS: folder deletion detaches vaults without destroying them");
    } finally {
        await db.delete(vaults).where(eq(vaults.id, vaultId));
        await db.delete(folders).where(eq(folders.id, folderId));
        await db.delete(users).where(eq(users.id, ownerId));
        await db.delete(users).where(eq(users.id, otherOwnerId));
        await pool.end();
    }
}

run().catch((error) => {
    console.error("Folder integration test failed:", error);
    process.exitCode = 1;
});
