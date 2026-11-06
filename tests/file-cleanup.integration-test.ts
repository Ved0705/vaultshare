import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/db/client.js";
import { users } from "../src/db/schema/users.js";
import { vaults } from "../src/db/schema/vaults.js";
import { files } from "../src/db/schema/files.js";
import { cleanupJobs } from "../src/db/schema/cleanup-jobs.js";
import { storeEncryptedFile } from "../src/modules/files/file-storage.service.js";
import { readEncryptedFile } from "../src/modules/files/file-storage.service.js";
import { processOneCleanupJob } from "../src/modules/files/file-cleanup.worker.js";

async function main() {
    const userId = randomUUID();
    const vaultId = randomUUID();
    const storageKey = await storeEncryptedFile(
        Buffer.from("encrypted-test-payload"),
    );

    let fileId: string | undefined;
    let jobId: string | undefined;

    try {
        await db.insert(users).values({
            id: userId,
            cognitoSub: `cleanup-test-${randomUUID()}`,
            email: `cleanup-${randomUUID()}@example.test`,
        });

        await db.insert(vaults).values({
            id: vaultId,
            ownerId: userId,
            name: "Cleanup integration test",
            description: null,
            encryptedContent: "",
            encryptedDek: "",
            encryptionNonce: "",
            encryptionTag: "",
            status: "DESTROYED",
            overallTtlSeconds: 3600,
            firstSharedAt: null,
            expiresAt: null,
            expiryPolicy: "DESTROY",
        });

        const [file] = await db.insert(files).values({
            vaultId,
            originalName: "test.bin",
            mimeType: "application/octet-stream",
            sizeBytes: 23,
            storageKey,
            encryptedDek: "test-dek",
            encryptionNonce: "test-nonce",
            encryptionTag: "test-tag",
            status: "ACTIVE",
        }).returning();

        assert.ok(file, "File fixture was not created");
        fileId = file.id;

        const [job] = await db.insert(cleanupJobs).values({
            resourceType: "VAULT",
            resourceId: vaultId,
            status: "PENDING",
            runAfter: new Date(Date.now() - 1000),
        }).returning();

        assert.ok(job, "Cleanup job fixture was not created");
        jobId = job.id;

        assert.equal(await processOneCleanupJob(), true);

        const [updatedFile] = await db
            .select()
            .from(files)
            .where(eq(files.id, fileId));

        assert.ok(updatedFile, "File row disappeared unexpectedly");
        assert.equal(updatedFile.status, "DELETED");

        const [updatedJob] = await db
            .select()
            .from(cleanupJobs)
            .where(eq(cleanupJobs.id, jobId));

        assert.ok(updatedJob, "Cleanup job row disappeared unexpectedly");
        assert.equal(updatedJob.status, "COMPLETED");
        assert.equal(updatedJob.attempts, 1);

        await assert.rejects(
            readEncryptedFile(storageKey),
            "Stored file should no longer exist",
        );

        assert.equal(await processOneCleanupJob(), false);

        console.log("PASS: vault cleanup physically deletes stored files.");
        console.log("PASS: cleanup job completes and is not reprocessed.");
    } finally {
        if (jobId) {
            await db.delete(cleanupJobs).where(eq(cleanupJobs.id, jobId));
        }

        if (fileId) {
            await db.delete(files).where(eq(files.id, fileId));
        }

        await db.delete(vaults).where(eq(vaults.id, vaultId));
        await db.delete(users).where(eq(users.id, userId));

        // The worker and storage service share this process's database pool.
        await pool.end();
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
