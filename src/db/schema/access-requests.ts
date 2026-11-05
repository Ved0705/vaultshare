
import {
    pgTable,
    uuid,
    varchar,
    text,
    timestamp,
    index,
    uniqueIndex,
    check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { users } from "./users.js";
import { vaults } from "./vaults.js";

export const accessRequests = pgTable(
    "access_requests",
    {
        id: uuid("id").defaultRandom().primaryKey(),

        vaultId: uuid("vault_id")
            .notNull()
            .references(() => vaults.id, { onDelete: "restrict" }),

        requesterId: uuid("requester_id")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),

        requestType: varchar("request_type", { length: 20 })
            .notNull()
            .default("READ"),

        message: text("message"),

        status: varchar("status", { length: 20 })
            .notNull()
            .default("PENDING"),

        reviewedBy: uuid("reviewed_by")
            .references(() => users.id, { onDelete: "set null" }),

        responseMessage: text("response_message"),

        requestedAt: timestamp("requested_at", {
            withTimezone: true,
        }).notNull().defaultNow(),

        reviewedAt: timestamp("reviewed_at", {
            withTimezone: true,
        }),

        cancelledAt: timestamp("cancelled_at", {
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
        index("access_requests_vault_id_idx").on(table.vaultId),
        index("access_requests_requester_id_idx").on(table.requesterId),
        index("access_requests_status_idx").on(table.status),

        uniqueIndex("access_requests_pending_unique")
            .on(table.vaultId, table.requesterId)
            .where(sql`${table.status} = 'PENDING'`),

        check(
            "access_requests_type_check",
            sql`${table.requestType} IN ('READ')`,
        ),

        check(
            "access_requests_status_check",
            sql`${table.status} IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')`,
        ),

        check(
            "access_requests_review_check",
            sql`(
                (${table.status} = 'PENDING'
                    AND ${table.reviewedAt} IS NULL
                    AND ${table.cancelledAt} IS NULL)
                OR
                (${table.status} IN ('APPROVED', 'REJECTED')
                    AND ${table.reviewedAt} IS NOT NULL
                    AND ${table.reviewedBy} IS NOT NULL
                    AND ${table.cancelledAt} IS NULL)
                OR
                (${table.status} = 'CANCELLED'
                    AND ${table.cancelledAt} IS NOT NULL
                    AND ${table.reviewedAt} IS NULL)
            )`,
        ),
    ],
);
