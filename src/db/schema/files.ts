
import {
    pgTable,
    uuid,
    varchar,
    integer,
    text,
    timestamp,
    index,
    check,
} from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import { vaults } from "./vaults.js";

export const files = pgTable("files", {
    id: uuid("id").defaultRandom().primaryKey(),

    vaultId: uuid("vault_id")
        .notNull()
        .references(() => vaults.id, { onDelete: "restrict" }),

    originalName: varchar("original_name", { length: 255 }).notNull(),

    mimeType: varchar("mime_type", { length: 255 }).notNull(),

    sizeBytes: integer("size_bytes").notNull(),

    storageKey: varchar("storage_key", { length: 100 }).notNull().unique(),

    encryptedDek: text("encrypted_dek").notNull(),

    encryptionNonce: varchar("encryption_nonce", { length: 64 }).notNull(),

    encryptionTag: varchar("encryption_tag", { length: 64 }).notNull(),

    status: varchar("status", { length: 20 }).notNull().default("ACTIVE"),

    createdAt: timestamp("created_at", { withTimezone: true })
        .notNull()
        .defaultNow(),

    updatedAt: timestamp("updated_at", { withTimezone: true })
        .notNull()
        .defaultNow(),
}, (table) => [
    index("files_vault_id_idx").on(table.vaultId),

    index("files_status_idx").on(table.status),

    check("files_size_positive_check", sql`${table.sizeBytes} > 0`),

    check(
        "files_status_check",
        sql`${table.status} IN ('ACTIVE', 'DELETED')`,
    ),
]);
