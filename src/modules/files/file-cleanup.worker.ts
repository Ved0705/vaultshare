
import { and, eq, lte, or, isNull } from "drizzle-orm";

import { db } from "../../db/client.js";
import { cleanupJobs } from "../../db/schema/cleanup-jobs.js";
import { files } from "../../db/schema/files.js";
import { vaults } from "../../db/schema/vaults.js";
import { deleteStoredFile } from "./file-storage.service.js";
import {pathToFileURL} from "node:url";

function isMissingFile(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ENOENT"
    );
}

function getSafeErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message.slice(0, 1000);
    }

    return "Unknown cleanup error.";
}

async function deleteFileBlob(storageKey: string): Promise<void> {
    try {
        await deleteStoredFile(storageKey);
    } catch (error) {
        if (!isMissingFile(error)) {
            throw error;
        }
    }
}

async function processFileBlob(
    fileId: string,
    storageKey: string | null,
): Promise<void> {
    // New jobs retain the storage key even if the file row is deleted.
    if (storageKey) {
        await deleteFileBlob(storageKey);
        return;
    }

    // Backward compatibility for older cleanup jobs.
    const [file] = await db
        .select({
            id: files.id,
            storageKey: files.storageKey,
        })
        .from(files)
        .where(eq(files.id, fileId))
        .limit(1);

    if (!file) return;

    await deleteFileBlob(file.storageKey);
}

async function processVaultCleanup(vaultId: string): Promise<void> {
    const [vault] = await db
        .select({
            id: vaults.id,
            status: vaults.status,
        })
        .from(vaults)
        .where(eq(vaults.id, vaultId))
        .limit(1);

    if (!vault || vault.status !== "DESTROYED") {
        throw new Error("Vault is missing or not destroyed.");
    }

    const vaultFiles = await db
        .select({
            id: files.id,
            storageKey: files.storageKey,
        })
        .from(files)
        .where(eq(files.vaultId, vaultId));

    for (const file of vaultFiles) {
        await deleteFileBlob(file.storageKey);

        await db
            .update(files)
            .set({
                status: "DELETED",
                updatedAt: new Date(),
            })
            .where(eq(files.id, file.id));
    }
}

export async function processOneCleanupJob(): Promise<boolean> {
    const now = new Date();
    const staleLock = new Date(now.getTime() - 5 * 60 * 1000);

    const job = await db.transaction(async (tx) => {
        const [nextJob] = await tx
            .select()
            .from(cleanupJobs)
            .where(
                and(
                    lte(cleanupJobs.runAfter, now),
                    or(
                        eq(cleanupJobs.status, "PENDING"),
                        and(
                            eq(cleanupJobs.status, "PROCESSING"),
                            or(
                                lte(cleanupJobs.lockedAt, staleLock),
                                isNull(cleanupJobs.lockedAt),
                            ),
                        ),
                    ),
                ),
            )
            .orderBy(cleanupJobs.runAfter)
            .for("update", { skipLocked: true })
            .limit(1);

        if (!nextJob) return null;

        const [claimed] = await tx
            .update(cleanupJobs)
            .set({
                status: "PROCESSING",
                attempts: nextJob.attempts + 1,
                lockedAt: now,
                updatedAt: now,
            })
            .where(eq(cleanupJobs.id, nextJob.id))
            .returning();

        return claimed;
    });

    if (!job) return false;

    try {
        if (job.resourceType === "FILE_BLOB") {
            await processFileBlob(job.resourceId, job.storageKey);
        } else if (job.resourceType === "VAULT") {
            await processVaultCleanup(job.resourceId);
        } else {
            throw new Error("Unsupported cleanup resource type.");
        }

        await db
            .update(cleanupJobs)
            .set({
                status: "COMPLETED",
                lockedAt: null,
                completedAt: new Date(),
                lastError: null,
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(cleanupJobs.id, job.id),
                    eq(cleanupJobs.status, "PROCESSING"),
                    eq(cleanupJobs.lockedAt, job.lockedAt!),
                ),
            );

    } catch (error) {
        const failedPermanently = job.attempts >= job.maxAttempts;

        const retryDelayMs = Math.min(
            60_000 * 2 ** Math.max(0, job.attempts - 1),
            60 * 60 * 1000,
        );

        await db
            .update(cleanupJobs)
            .set({
                status: failedPermanently ? "FAILED" : "PENDING",
                lockedAt: null,
                runAfter: new Date(Date.now() + retryDelayMs),
                lastError: getSafeErrorMessage(error),
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(cleanupJobs.id, job.id),
                    eq(cleanupJobs.status, "PROCESSING"),
                    eq(cleanupJobs.lockedAt, job.lockedAt!),
                ),
            );
    }

    return true;
}

async function startCleanupWorker() {
    console.log("VaultShare cleanup worker started.");

    while (true) {
        try {
            const processed = await processOneCleanupJob();

            if (!processed) {
                await new Promise((resolve) => setTimeout(resolve, 10_000));
            }
        } catch (error) {
            console.error("Cleanup worker error:", error);
            await new Promise((resolve) => setTimeout(resolve, 5_000));
        }
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    startCleanupWorker();
}
