import {
    pgTable,
    uuid,
    varchar,
    timestamp,
    index,
    unique,
} from "drizzle-orm/pg-core";

import { users } from "./users.js";

export const folders = pgTable(
    "folders",
    {
        id: uuid("id").defaultRandom().primaryKey(),

        ownerId: uuid("owner_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),

        name: varchar("name", { length: 100 }).notNull(),

        createdAt: timestamp("created_at", {
            withTimezone: true,
        }).notNull().defaultNow(),

        updatedAt: timestamp("updated_at", {
            withTimezone: true,
        }).notNull().defaultNow(),
    },
    (table) => [
        index("folders_owner_id_idx").on(table.ownerId),

        unique("folders_id_owner_id_unique").on(
            table.id,
            table.ownerId,
        ),
    ],
);
