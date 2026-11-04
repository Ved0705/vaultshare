import {
    pgTable,
    uuid,
    timestamp,
    index,
    unique,
} from "drizzle-orm/pg-core";

import { vaults } from "./vaults.js";
import { writeRequests } from "./write-requests.js";
import { users } from "./users.js";

export const vaultLineage = pgTable(
    "vault_lineage",
    {
        id: uuid("id").defaultRandom().primaryKey(),

        sourceVaultId: uuid("source_vault_id")
            .notNull()
            .references(() => vaults.id, { onDelete: "restrict" }),

        derivedVaultId: uuid("derived_vault_id")
            .notNull()
            .references(() => vaults.id, { onDelete: "restrict" }),

        writeRequestId: uuid("write_request_id")
            .notNull()
            .references(() => writeRequests.id, { onDelete: "restrict" }),

        createdBy: uuid("created_by")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),

        createdAt: timestamp("created_at", { withTimezone: true })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        unique("vault_lineage_derived_vault_unique").on(table.derivedVaultId),
        unique("vault_lineage_write_request_unique").on(table.writeRequestId),
        index("vault_lineage_source_vault_idx").on(table.sourceVaultId),
    ],
);