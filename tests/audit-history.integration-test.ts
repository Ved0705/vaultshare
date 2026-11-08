import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

import { db, pool } from "../src/db/client.js";
import { users } from "../src/db/schema/users.js";
import { auditEvents } from "../src/db/schema/audit-events.js";
import { listOwnAuditEventsService } from "../src/modules/audit/audit-history.service.js";

const actorId = randomUUID();
const otherActorId = randomUUID();

async function run() {
    try {
        await db.insert(users).values([
            { id: actorId, cognitoSub: `audit-${actorId}`, email: `audit-${actorId}@example.test`, emailVerified: true },
            { id: otherActorId, cognitoSub: `audit-other-${otherActorId}`, email: `audit-other-${otherActorId}@example.test`, emailVerified: true },
        ]);
        await db.insert(auditEvents).values([
            { actorUserId: actorId, actorCognitoSub: `audit-${actorId}`, action: "GET /api/v1/vaults/:id", method: "GET", route: "/api/v1/vaults/:id", statusCode: 200 },
            { actorUserId: actorId, actorCognitoSub: `audit-${actorId}`, action: "POST /api/v1/shares/:shareCode/open", method: "POST", route: "/api/v1/shares/:shareCode/open", statusCode: 403 },
            { actorUserId: otherActorId, actorCognitoSub: `audit-other-${otherActorId}`, action: "DELETE /api/v1/users/me", method: "DELETE", route: "/api/v1/users/me", statusCode: 204 },
        ]);

        const ownEvents = await listOwnAuditEventsService(actorId, 25, 0);
        assert.equal(ownEvents.length, 2);
        assert.ok(ownEvents.every((event) => event.action !== "DELETE /api/v1/users/me"));
        assert.ok(ownEvents.every((event) => !event.route.includes("share-code-secret")));
        assert.equal((await listOwnAuditEventsService(actorId, 1, 1)).length, 1);
        console.log("PASS: audit history is actor-scoped and paginated");
    } finally {
        await db.delete(auditEvents).where(eq(auditEvents.actorUserId, actorId));
        await db.delete(auditEvents).where(eq(auditEvents.actorUserId, otherActorId));
        await db.delete(users).where(eq(users.id, actorId));
        await db.delete(users).where(eq(users.id, otherActorId));
        await pool.end();
    }
}

run().catch((error) => {
    console.error("Audit history integration test failed:", error);
    process.exitCode = 1;
});
