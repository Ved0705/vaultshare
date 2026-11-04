import {
    pgTable,
    uuid,
    boolean,
    timestamp,
    index,
} from "drizzle-orm/pg-core";

import { shares } from "./shares.js";
import { users } from "./users.js";

export const passphraseAttempts = pgTable(
    "passphrase_attempts",
    {
        id: uuid("id").defaultRandom().primaryKey(),

        shareId: uuid("share_id")
            .notNull()
            .references(() => shares.id, { onDelete: "cascade" }),

        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),

        succeeded: boolean("succeeded").notNull().default(false),

        attemptedAt: timestamp("attempted_at", {
            withTimezone: true,
        }).notNull().defaultNow(),
    },
    (table) => [
        index("passphrase_attempts_share_user_time_idx").on(
            table.shareId,
            table.userId,
            table.attemptedAt,
        ),
    ],
);