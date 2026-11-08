import { sql } from "drizzle-orm";

import {
    pgTable,
    uuid,
    varchar,
    boolean,
    timestamp,
    check,
} from "drizzle-orm/pg-core";

export const users = pgTable(
    "users",
    {
        id: uuid("id").defaultRandom().primaryKey(),

        cognitoSub: varchar("cognito_sub", {
            length: 255,
        }).notNull().unique(),

        email: varchar("email", {
            length: 320,
        }).notNull().unique(),

        emailVerified: boolean("email_verified")
            .notNull()
            .default(false),

        status: varchar("status", {
            length: 20,
        }).notNull().default("ACTIVE"),

        createdAt: timestamp("created_at", {
            withTimezone: true,
        }).notNull().defaultNow(),

        updatedAt: timestamp("updated_at", {
            withTimezone: true,
        }).notNull().defaultNow(),
    },
    (table) => [
        check(
            "users_status_check",
            sql`${table.status} IN ('ACTIVE', 'DELETION_PENDING', 'DELETED')`,
        ),
    ],
);