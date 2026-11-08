import { pgTable, uuid, varchar, integer, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users.js";
export const auditEvents = pgTable("audit_events", {
 id: uuid("id").defaultRandom().primaryKey(),
 actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
 actorCognitoSub: varchar("actor_cognito_sub", { length: 255 }),
 action: varchar("action", { length: 120 }).notNull(),
 method: varchar("method", { length: 10 }).notNull(),
 route: varchar("route", { length: 255 }).notNull(),
 resourceId: uuid("resource_id"),
 statusCode: integer("status_code").notNull(),
 createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("audit_events_actor_created_idx").on(t.actorUserId,t.createdAt),index("audit_events_resource_created_idx").on(t.resourceId,t.createdAt),index("audit_events_created_idx").on(t.createdAt)]);
