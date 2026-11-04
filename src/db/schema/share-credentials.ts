
import {
    pgTable,
    uuid,
    varchar,
    timestamp,
    index,
    unique,
} from "drizzle-orm/pg-core";

import { shares } from "./shares.js";

export const shareCredentials = pgTable(
    "share_credentials",
    {
        id: uuid("id").defaultRandom().primaryKey(),

        shareId: uuid("share_id")
            .notNull()
            .references(() => shares.id, { onDelete: "cascade" }),

        passphraseHash: varchar("passphrase_hash", {
            length: 255,
        }).notNull(),

        createdAt: timestamp("created_at", {
            withTimezone: true,
        })
            .notNull()
            .defaultNow(),

        updatedAt: timestamp("updated_at", {
            withTimezone: true,
        })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        unique("share_credentials_share_id_unique").on(table.shareId),
        index("share_credentials_share_id_idx").on(table.shareId),
    ],
);
