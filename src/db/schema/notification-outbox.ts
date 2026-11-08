import {
    pgTable,
    uuid,
    varchar,
    integer,
    timestamp,
    index,
    check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";

export const notificationOutbox = pgTable(
    "notification_outbox",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        recipientUserId: uuid("recipient_user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        eventType: varchar("event_type", { length: 64 }).notNull(),
        status: varchar("status", { length: 16 }).notNull().default("PENDING"),
        attempts: integer("attempts").notNull().default(0),
        nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
            .notNull()
            .defaultNow(),
        lastError: varchar("last_error", { length: 120 }),
        sentAt: timestamp("sent_at", { withTimezone: true }),
        createdAt: timestamp("created_at", { withTimezone: true })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        check(
            "notification_outbox_status_check",
            sql`${table.status} in ('PENDING', 'SENT', 'FAILED')`,
        ),
        check(
            "notification_outbox_attempts_check",
            sql`${table.attempts} >= 0`,
        ),
        index("notification_outbox_pending_idx").on(
            table.status,
            table.nextAttemptAt,
            table.createdAt,
        ),
        index("notification_outbox_recipient_created_idx").on(
            table.recipientUserId,
            table.createdAt,
        ),
    ],
);
