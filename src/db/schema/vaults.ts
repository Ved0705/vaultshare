
import {
    pgTable,
    uuid,
    varchar,
    text,
    timestamp,
    integer,
    index,
    check,
    foreignKey,
} from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import { users } from "./users.js";
import { folders } from "./folders.js";

export const vaults = pgTable(
    "vaults",
    {
        id: uuid("id").defaultRandom().primaryKey(),

        ownerId: uuid("owner_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),

        folderId: uuid("folder_id"),

        name: varchar("name", { length: 150 }).notNull(),

        description: varchar("description", { length: 500 }),

        encryptedContent: text("encrypted_content").notNull(),

        encryptedDek: text("encrypted_dek").notNull(),

        kekVersion: integer("kek_version").notNull().default(1),

        encryptionNonce: varchar("encryption_nonce", { length: 64 }).notNull(),

        encryptionTag: varchar("encryption_tag", { length: 64 }).notNull(),

        status: varchar("status", { length: 20 })
            .notNull()
            .default("ACTIVE"),

        overallTtlSeconds: integer("overall_ttl_seconds").notNull(),

        firstSharedAt: timestamp("first_shared_at", {
            withTimezone: true,
        }),

        expiresAt: timestamp("expires_at", {
            withTimezone: true,
        }),

        expiryPolicy: varchar("expiry_policy", { length: 20 })
            .notNull()
            .default("DESTROY"),

        createdAt: timestamp("created_at", {
            withTimezone: true,
        }).notNull().defaultNow(),

        updatedAt: timestamp("updated_at", {
            withTimezone: true,
        }).notNull().defaultNow(),
    },
    (table) => [
        index("vaults_owner_id_idx").on(table.ownerId),
        index("vaults_folder_id_idx").on(table.folderId),
        index("vaults_status_idx").on(table.status),

        foreignKey({
            columns: [table.folderId, table.ownerId],
            foreignColumns: [folders.id, folders.ownerId],
        }).onDelete("no action"),

        check(
            "vaults_status_check",
            sql`${table.status} IN ('ACTIVE', 'EXPIRED', 'REVOKED', 'DESTROYED')`,
        ),

        check(
            "vaults_expiry_timestamp_check",
            sql`
        (
            first_shared_at IS NULL
            AND expires_at IS NULL
        )
        OR
        (
            first_shared_at IS NOT NULL
            AND expires_at IS NOT NULL
            AND expires_at = first_shared_at
                + overall_ttl_seconds * INTERVAL '1 second'
        )
    `,
        ),

        check(
            "vaults_overall_ttl_check",
            sql`${table.overallTtlSeconds} > 0`,
        ),

        check(
            "vaults_expiry_policy_check",
            sql`${table.expiryPolicy} IN ('DESTROY', 'REVOKE_ACCESS')`,
        ),
    ],
);
