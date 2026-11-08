import { lt, sql } from "drizzle-orm";
import { db, pool } from "../../db/client.js";
import { auditEvents } from "../../db/schema/audit-events.js";

async function main() {
    const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    try {
        const [count] = await db.select({ count: sql<number>`count(*)::int` })
            .from(auditEvents).where(lt(auditEvents.createdAt, cutoff));
        process.stdout.write(`Audit events older than 365 days: ${count.count}\n`);
        if (process.argv.includes("--apply")) {
            const deleted = await db.delete(auditEvents)
                .where(lt(auditEvents.createdAt, cutoff))
                .returning({ id: auditEvents.id });
            process.stdout.write(`Deleted ${deleted.length} expired audit events.\n`);
        } else {
            process.stdout.write("Dry run only. Re-run with --apply to delete.\n");
        }
    } finally { await pool.end(); }
}
main().catch((error) => {
    process.stderr.write("Audit retention failed: " + (error instanceof Error ? error.name : "UnknownError") + "\n");
    process.exitCode = 1;
});
