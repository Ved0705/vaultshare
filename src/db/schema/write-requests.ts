import {
    pgTable,
    uuid,
    varchar,
    text,
    timestamp,
    index,
    unique,
    check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { vaults } from "./vaults.js";
import { shares } from "./shares.js";
import { users } from "./users.js";

export const writeRequests = pgTable(
    "write_requests",
    {
        id: uuid("id").defaultRandom().primaryKey(),

        shareId: uuid("share_id")
            .notNull()
            .references(() => shares.id, { onDelete: "restrict" }),

        sourceVaultId: uuid("source_vault_id")
            .notNull()
            .references(() => vaults.id, { onDelete: "restrict" }),

        requestedBy: uuid("requested_by")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),

        status: varchar("status", { length: 20 })
            .notNull()
            .default("PENDING"),

        encryptedContent: text("encrypted_content").notNull(),
        encryptedDek: text("encrypted_dek").notNull(),
        kekVersion: integer("kek_version").notNull().default(1),
        encryptionNonce: varchar("encryption_nonce", { length: 64 }).notNull(),
        encryptionTag: varchar("encryption_tag", { length: 64 }).notNull(),

        derivedVaultId: uuid("derived_vault_id")
            .references(() => vaults.id, { onDelete: "set null" }),

        reviewedBy: uuid("reviewed_by")
            .references(() => users.id, { onDelete: "set null" }),

        requestedAt: timestamp("requested_at", { withTimezone: true })
            .notNull()
            .defaultNow(),

        reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    },
    (table) => [
        unique("write_requests_share_id_unique").on(table.shareId),

        index("write_requests_source_vault_id_idx").on(table.sourceVaultId),
        index("write_requests_requested_by_idx").on(table.requestedBy),
        index("write_requests_status_idx").on(table.status),

        check(
            "write_requests_status_check",
            sql`${table.status} IN ('PENDING', 'APPROVED', 'REJECTED')`,
        ),

        check(
            "write_requests_review_consistency_check",
            sql`(
                (${table.status} = 'PENDING' AND ${table.reviewedAt} IS NULL AND ${table.reviewedBy} IS NULL AND ${table.derivedVaultId} IS NULL)
                OR
                (${table.status} = 'APPROVED' AND ${table.reviewedAt} IS NOT NULL AND ${table.reviewedBy} IS NOT NULL AND ${table.derivedVaultId} IS NOT NULL)
                OR
                (${table.status} = 'REJECTED' AND ${table.reviewedAt} IS NOT NULL AND ${table.reviewedBy} IS NOT NULL AND ${table.derivedVaultId} IS NULL)
            )`,
        ),
    ],
);