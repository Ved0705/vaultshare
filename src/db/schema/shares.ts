
import {
    pgTable,
    uuid,
    varchar,
    integer,
    timestamp,
    index,
    uniqueIndex,
    check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { vaults } from "./vaults.js";
import { users } from "./users.js";

export const shares = pgTable(
    "shares",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        shareCode: varchar("share_code", { length: 32 })
            .notNull()
            .unique(),

        vaultId: uuid("vault_id")
            .notNull()
            .references(() => vaults.id, { onDelete: "cascade" }),

        readerId: uuid("reader_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),

        permissions: varchar("permissions", { length: 10 })
            .array()
            .notNull(),

        status: varchar("status", { length: 30 })
            .notNull()
            .default("active"),

        maxAccessCount: integer("max_access_count").notNull(),

        successfulOpenCount: integer("successful_open_count")
            .notNull()
            .default(0),

        sharedAt: timestamp("shared_at", { withTimezone: true })
            .notNull()
            .defaultNow(),

        firstOpenedAt: timestamp("first_opened_at", {
            withTimezone: true,
        }),

        postOpenTtlSeconds: integer("post_open_ttl_seconds"),

        postOpenExpiresAt: timestamp("post_open_expires_at", {
            withTimezone: true,
        }),

        revokedAt: timestamp("revoked_at", { withTimezone: true }),

        createdAt: timestamp("created_at", { withTimezone: true })
            .notNull()
            .defaultNow(),

        updatedAt: timestamp("updated_at", { withTimezone: true })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        index("shares_vault_id_idx").on(table.vaultId),
        index("shares_reader_id_idx").on(table.readerId),
        index("shares_status_idx").on(table.status),
        index("shares_post_open_expires_at_idx").on(
            table.postOpenExpiresAt,
        ),

        uniqueIndex("shares_active_reader_vault_unique")
            .on(table.vaultId, table.readerId)
            .where(sql`${table.status} = 'active'`),

        check(
            "shares_status_check",
            sql`${table.status} IN ('pending', 'active', 'expired', 'revoked')`,
        ),

        check(
            "shares_permissions_check",
            sql`cardinality(${table.permissions}) > 0
                AND ${table.permissions} <@ ARRAY['READ', 'WRITE']::varchar[]`,
        ),

        check(
            "shares_max_access_count_check",
            sql`${table.maxAccessCount} > 0`,
        ),

        check(
            "shares_successful_open_count_check",
            sql`${table.successfulOpenCount} >= 0
                AND ${table.successfulOpenCount} <= ${table.maxAccessCount}`,
        ),

        check(
            "shares_post_open_ttl_check",
            sql`${table.postOpenTtlSeconds} IS NULL
                OR ${table.postOpenTtlSeconds} > 0`,
        ),

        check(
            "shares_post_open_expiry_check",
            sql`(
                    (${table.firstOpenedAt} IS NULL
                        AND ${table.postOpenExpiresAt} IS NULL)
                        OR
                        (${table.firstOpenedAt} IS NOT NULL
                        AND (
                        (${table.postOpenTtlSeconds} IS NULL
                        AND ${table.postOpenExpiresAt} IS NULL)
                        OR
                        (${table.postOpenTtlSeconds} IS NOT NULL
                        AND ${table.postOpenExpiresAt} IS NOT NULL)
                        ))
                )`,
        ),
    ],
);
