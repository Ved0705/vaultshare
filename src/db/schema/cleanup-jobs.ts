
import {
    pgTable,
    uuid,
    varchar,
    integer,
    text,
    timestamp,
    index,
    check,
    uniqueIndex,
} from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";

export const cleanupJobs = pgTable(
    "cleanup_jobs",
    {
        id: uuid("id").defaultRandom().primaryKey(),

        resourceType: varchar("resource_type", { length: 30 }).notNull(),

        resourceId: uuid("resource_id").notNull(),
        storageKey: varchar("storage_key", { length: 64 }),

        status: varchar("status", { length: 20 })
            .notNull()
            .default("PENDING"),

        attempts: integer("attempts").notNull().default(0),

        maxAttempts: integer("max_attempts").notNull().default(5),

        runAfter: timestamp("run_after", {
            withTimezone: true,
        }).notNull().defaultNow(),

        lockedAt: timestamp("locked_at", {
            withTimezone: true,
        }),

        lastError: text("last_error"),

        completedAt: timestamp("completed_at", {
            withTimezone: true,
        }),

        createdAt: timestamp("created_at", {
            withTimezone: true,
        }).notNull().defaultNow(),

        updatedAt: timestamp("updated_at", {
            withTimezone: true,
        }).notNull().defaultNow(),
    },
    (table) => [
        index("cleanup_jobs_status_run_after_idx").on(
            table.status,
            table.runAfter,
        ),

        index("cleanup_jobs_resource_idx").on(
            table.resourceType,
            table.resourceId,
        ),

        uniqueIndex("cleanup_jobs_active_resource_unique")
            .on(table.resourceType, table.resourceId)
            .where(
                sql`${table.status} IN ('PENDING', 'PROCESSING')`,
            ),

        check(
            "cleanup_jobs_resource_type_check",
            sql`${table.resourceType} IN ('FILE_BLOB', 'VAULT')`,
        ),

        check(
            "cleanup_jobs_status_check",
            sql`${table.status} IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')`,
        ),

        check(
            "cleanup_jobs_attempts_check",
            sql`${table.attempts} >= 0 AND ${table.maxAttempts} > 0`,
        ),
    ],
);
