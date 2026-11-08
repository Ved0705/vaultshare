import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";

import { db, pool } from "../src/db/client.js";
import { users } from "../src/db/schema/users.js";
import { notificationOutbox } from "../src/db/schema/notification-outbox.js";
import { processPendingNotifications } from "../src/infrastructure/email/notification.worker.js";

const verifiedUserId = randomUUID();
const unverifiedUserId = randomUUID();
const notificationIds = [randomUUID(), randomUUID()];

async function run(): Promise<void> {
    try {
        await db.insert(users).values([
            {
                id: verifiedUserId,
                cognitoSub: `notification-verified-${verifiedUserId}`,
                email: `notification-verified-${verifiedUserId}@example.test`,
                emailVerified: true,
            },
            {
                id: unverifiedUserId,
                cognitoSub: `notification-unverified-${unverifiedUserId}`,
                email: `notification-unverified-${unverifiedUserId}@example.test`,
                emailVerified: false,
            },
        ]);

        await db.insert(notificationOutbox).values([
            {
                id: notificationIds[0],
                recipientUserId: verifiedUserId,
                eventType: "SHARE_CREATED",
            },
            {
                id: notificationIds[1],
                recipientUserId: unverifiedUserId,
                eventType: "ACCESS_REQUEST_CREATED",
            },
        ]);

        const processed = await processPendingNotifications(10);
        assert.equal(processed, 2, "both due notification jobs should be processed");

        const rows = await db
            .select()
            .from(notificationOutbox)
            .where(inArray(notificationOutbox.id, notificationIds));

        const sent = rows.find((row) => row.id === notificationIds[0]);
        const rejected = rows.find((row) => row.id === notificationIds[1]);

        assert.ok(sent);
        assert.equal(sent.status, "SENT");
        assert.equal(sent.attempts, 1);
        assert.ok(sent.sentAt);

        assert.ok(rejected);
        assert.equal(rejected.status, "FAILED");
        assert.equal(rejected.lastError, "RECIPIENT_UNAVAILABLE");
        assert.equal(rejected.attempts, 1);

        console.log("PASS: verified recipient receives an event-driven notification through SMTP");
        console.log("PASS: unverified recipients are not emailed and are marked unavailable");
        console.log("PASS: notification delivery state and attempts are persisted");
        console.log("\nNotification outbox integration test passed.");
    } finally {
        await db.delete(users).where(inArray(users.id, [
            verifiedUserId,
            unverifiedUserId,
        ]));
        await pool.end();
    }
}

run().catch((error) => {
    console.error("Notification outbox integration test failed:", error);
    process.exitCode = 1;
});
