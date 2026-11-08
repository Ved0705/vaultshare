import { desc, eq } from "drizzle-orm";

import { db } from "../../db/client.js";
import { auditEvents } from "../../db/schema/audit-events.js";

export async function listOwnAuditEventsService(actorUserId: string, limit: number, offset: number) {
    return db
        .select({
            id: auditEvents.id,
            action: auditEvents.action,
            method: auditEvents.method,
            route: auditEvents.route,
            resourceId: auditEvents.resourceId,
            statusCode: auditEvents.statusCode,
            createdAt: auditEvents.createdAt,
        })
        .from(auditEvents)
        .where(eq(auditEvents.actorUserId, actorUserId))
        .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
        .limit(limit)
        .offset(offset);
}
