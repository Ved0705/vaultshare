import type { Request, Response, NextFunction } from "express";
import { db } from "../db/client.js";
import { auditEvents } from "../db/schema/audit-events.js";
import { logger } from "../config/logger.js";

const resourcePattern = /\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:\/|$)/i;
const shareCodePattern = /\/[A-Za-z0-9_-]{32}(?=\/|$)/g;

export function auditRequest(req: Request, res: Response, next: NextFunction): void {
    res.once("finish", () => {
        if (!req.path.startsWith("/api/v1/") || req.method === "OPTIONS") return;

        const actor = req.user;
        // Store the normalized path, not the raw URL: share codes and UUIDs
        // must never become part of the audit trail.
        const route = req.path
            .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id")
            .replace(shareCodePattern, "/:shareCode")
            .slice(0, 255);
        const resourceId = req.path.match(resourcePattern)?.[1] ?? null;

        void db.insert(auditEvents).values({
            actorUserId: actor?.id ?? null,
            actorCognitoSub: actor?.cognitoSub ?? null,
            action: `${req.method} ${route}`.slice(0, 120),
            method: req.method.slice(0, 10),
            route,
            resourceId,
            statusCode: res.statusCode,
        }).catch((error: unknown) => {
            logger.error({
                errorName: error instanceof Error ? error.name : "UnknownError",
            }, "Audit event persistence failed");
        });
    });
    next();
}
