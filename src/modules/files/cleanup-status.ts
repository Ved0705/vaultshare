import { sql } from "drizzle-orm";
import { db, pool } from "../../db/client.js";
import { cleanupJobs } from "../../db/schema/cleanup-jobs.js";

async function main() {
    try {
        const [summary] = await db
            .select({
                pending: sql<number>`count(*) filter (where status = 'PENDING')::int`,
                processing: sql<number>`count(*) filter (where status = 'PROCESSING')::int`,
                failed: sql<number>`count(*) filter (where status = 'FAILED')::int`,
                completed: sql<number>`count(*) filter (where status = 'COMPLETED')::int`,
                oldestPendingAt: sql<Date | null>`min(created_at) filter (where status = 'PENDING')`,
            })
            .from(cleanupJobs);

        const oldestPendingAgeMinutes = summary.oldestPendingAt
            ? Math.floor((Date.now() - new Date(summary.oldestPendingAt).getTime()) / 60_000)
            : null;

        process.stdout.write(JSON.stringify({
            ...summary,
            oldestPendingAgeMinutes,
            alert: summary.failed > 0 || (oldestPendingAgeMinutes !== null && oldestPendingAgeMinutes > 15),
        }, null, 2) + "\n");

        if (summary.failed > 0 || (oldestPendingAgeMinutes !== null && oldestPendingAgeMinutes > 15)) {
            process.exitCode = 2;
        }
    } finally {
        await pool.end();
    }
}

main().catch((error) => {
    process.stderr.write("Cleanup status check failed: " + (error instanceof Error ? error.name : "UnknownError") + "\n");
    process.exitCode = 1;
});
