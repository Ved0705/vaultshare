import {
    pgTable,
    uuid,
    varchar,
    boolean,
    timestamp,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
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

    createdAt: timestamp("created_at", {
        withTimezone: true,
    }).notNull().defaultNow(),

    updatedAt: timestamp("updated_at", {
        withTimezone: true,
    }).notNull().defaultNow(),
});