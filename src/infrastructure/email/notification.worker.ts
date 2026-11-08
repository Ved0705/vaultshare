import { and, asc, eq, lte, sql } from "drizzle-orm";
import { pathToFileURL } from "node:url";

import { db, pool } from "../../db/client.js";
import { notificationOutbox } from "../../db/schema/notification-outbox.js";
import { users } from "../../db/schema/users.js";
import { logger } from "../../config/logger.js";
import {
    sendNotificationEmail,
    type NotificationEventType,
} from "./email.service.js";

const POLL_INTERVAL_MS = 30_000;
const MAX_ATTEMPTS = 5;
const DEFAULT_BATCH_SIZE = 20;

export async function processPendingNotifications(
    batchSize = DEFAULT_BATCH_SIZE,
): Promise<number> {
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) {
        throw new Error("Notification batch size must be between 1 and 100");
    }

    return db.transaction(async (tx) => {
        const pending = await tx
            .select()
            .from(notificationOutbox)
            .where(
                and(
                    eq(notificationOutbox.status, "PENDING"),
                    lte(notificationOutbox.nextAttemptAt, new Date()),
                ),
            )
            .orderBy(asc(notificationOutbox.createdAt))
            .limit(batchSize)
            .for("update", { skipLocked: true });

        let processed = 0;

        for (const job of pending) {
            const [recipient] = await tx
                .select({
                    email: users.email,
                    emailVerified: users.emailVerified,
                    status: users.status,
                })
                .from(users)
                .where(eq(users.id, job.recipientUserId))
                .limit(1);

            if (!recipient || !recipient.emailVerified || recipient.status !== "ACTIVE") {
                await tx
                    .update(notificationOutbox)
                    .set({
                        status: "FAILED",
                        attempts: job.attempts + 1,
                        lastError: "RECIPIENT_UNAVAILABLE",
                    })
                    .where(eq(notificationOutbox.id, job.id));
                processed++;
                continue;
            }

            try {
                await sendNotificationEmail(
                    recipient.email,
                    job.eventType as NotificationEventType,
                );

                await tx
                    .update(notificationOutbox)
                    .set({
                        status: "SENT",
                        attempts: job.attempts + 1,
                        sentAt: new Date(),
                        lastError: null,
                    })
                    .where(eq(notificationOutbox.id, job.id));
            } catch (error) {
                const attempts = job.attempts + 1;
                const terminal = attempts >= MAX_ATTEMPTS;
                const delayMs = Math.min(60 * 60 * 1000, 30_000 * 2 ** job.attempts);

                await tx
                    .update(notificationOutbox)
                    .set({
                        status: terminal ? "FAILED" : "PENDING",
                        attempts,
                        nextAttemptAt: new Date(Date.now() + delayMs),
                        lastError: error instanceof Error ? error.name.slice(0, 120) : "UnknownError",
                    })
                    .where(eq(notificationOutbox.id, job.id));

                logger.warn({
                    notificationId: job.id,
                    attempt: attempts,
                    errorName: error instanceof Error ? error.name : "UnknownError",
                }, "VaultShare notification delivery failed");
            }

            processed++;
        }

        return processed;
    });
}

async function startNotificationWorker(): Promise<void> {
    logger.info("VaultShare notification worker started");

    while (true) {
        try {
            await processPendingNotifications();
        } catch (error) {
            logger.error({
                errorName: error instanceof Error ? error.name : "UnknownError",
            }, "VaultShare notification worker cycle failed");
        }

        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    void startNotificationWorker().catch(async (error: unknown) => {
        logger.error({
            errorName: error instanceof Error ? error.name : "UnknownError",
        }, "VaultShare notification worker stopped");
        await pool.end();
        process.exitCode = 1;
    });
}
