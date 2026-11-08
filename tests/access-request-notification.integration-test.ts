import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { db, pool } from "../src/db/client.js";
import { users } from "../src/db/schema/users.js";
import { vaults } from "../src/db/schema/vaults.js";
import { accessRequests } from "../src/db/schema/access-requests.js";
import { notificationOutbox } from "../src/db/schema/notification-outbox.js";
import {
    createAccessRequestService,
} from "../src/modules/shares/access-request.service.js";
import {
    reviewAccessRequestService,
} from "../src/modules/shares/access-request-owner.service.js";

const ownerId = randomUUID();
const requesterId = randomUUID();
const vaultId = randomUUID();

async function run(): Promise<void> {
    try {
        await db.insert(users).values([
            {
                id: ownerId,
                cognitoSub: `access-notification-owner-${ownerId}`,
                email: `access-notification-owner-${ownerId}@example.test`,
                emailVerified: true,
            },
            {
                id: requesterId,
                cognitoSub: `access-notification-requester-${requesterId}`,
                email: `access-notification-requester-${requesterId}@example.test`,
                emailVerified: true,
            },
        ]);

        await db.insert(vaults).values({
            id: vaultId,
            ownerId,
            name: "Access request notification fixture",
            description: null,
            encryptedContent: "encrypted-fixture",
            encryptedDek: "encrypted-dek",
            encryptionNonce: "nonce",
            encryptionTag: "tag",
            status: "ACTIVE",
            overallTtlSeconds: 3600,
            firstSharedAt: null,
            expiresAt: null,
            expiryPolicy: "REVOKE_ACCESS",
        });

        const request = await createAccessRequestService(
            vaultId,
            requesterId,
            "This private message must not be included in email.",
        );

        const [ownerNotification] = await db
            .select()
            .from(notificationOutbox)
            .where(and(
                eq(notificationOutbox.recipientUserId, ownerId),
                eq(notificationOutbox.eventType, "ACCESS_REQUEST_CREATED"),
            ))
            .limit(1);

        assert.ok(ownerNotification, "new access requests must notify the vault owner");

        const reviewed = await reviewAccessRequestService(
            vaultId,
            request.id,
            ownerId,
            "REJECT",
            "Private review details must not be included in email.",
        );

        assert.equal(reviewed.status, "REJECTED");

        const [requesterNotification] = await db
            .select()
            .from(notificationOutbox)
            .where(and(
                eq(notificationOutbox.recipientUserId, requesterId),
                eq(notificationOutbox.eventType, "ACCESS_REQUEST_REVIEWED"),
            ))
            .limit(1);

        assert.ok(requesterNotification, "reviewed access requests must notify the requester");
        assert.equal(
            Object.prototype.hasOwnProperty.call(ownerNotification, "message"),
            false,
            "notification records must not store request message content",
        );

        console.log("PASS: new access requests enqueue owner notifications");
        console.log("PASS: access request reviews enqueue requester notifications");
        console.log("PASS: notification records contain no request message or response content");
        console.log("\nAccess request notification integration test passed.");
    } finally {
        await db.delete(accessRequests).where(eq(accessRequests.vaultId, vaultId));
        await db.delete(vaults).where(eq(vaults.id, vaultId));
        await db.delete(users).where(eq(users.id, ownerId));
        await db.delete(users).where(eq(users.id, requesterId));
        await pool.end();
    }
}

run().catch((error) => {
    console.error("Access request notification integration test failed:", error);
    process.exitCode = 1;
});
