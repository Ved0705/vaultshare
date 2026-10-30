
import { sql } from "drizzle-orm";
import { db, pool } from "./client.js";

async function testConnection() {
    try {
        const result = await db.execute(
            sql`SELECT NOW() AS current_time`
        );

        console.log("Drizzle ORM connected successfully!");
        console.log("Database time:", result.rows[0]?.current_time);
    } catch (error) {
        console.error("Database connection failed:", error);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

await testConnection();
