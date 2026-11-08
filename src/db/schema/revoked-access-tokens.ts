import { pgTable, varchar, timestamp, index } from "drizzle-orm/pg-core";
export const revokedAccessTokens = pgTable("revoked_access_tokens", {
 jti: varchar("jti", { length: 255 }).primaryKey(),
 expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
 createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("revoked_access_tokens_expires_idx").on(t.expiresAt)]);
