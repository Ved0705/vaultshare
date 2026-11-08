import "dotenv/config";
import { Pool } from "pg";
import { env } from "../config/env.js";
import { rewrapKekEncryptedDek } from "./encryption.service.js";

const APPLY = process.argv.includes("--apply");
if (env.VAULT_KEK_CURRENT_VERSION !== 2) {
    throw new Error("Set VAULT_KEK_CURRENT_VERSION=2 before running the KEK rotation.");
}
if (!env.VAULT_KEK_V2_BASE64) {
    throw new Error("VAULT_KEK_V2_BASE64 is required.");
}

const pool = new Pool({ connectionString: env.DATABASE_URL, max: 1 });
const client = await pool.connect();

async function rotateTable(table: "vaults" | "write_requests") {
    const selected = await client.query(
        `SELECT id, encrypted_dek, kek_version FROM ${table} WHERE kek_version <> 2 ORDER BY id FOR UPDATE`,
    );
    let updated = 0;
    for (const row of selected.rows) {
        const version = Number(row.kek_version);
        if (version !== 1) {
            throw new Error(`Unsupported KEK version found in ${table}; refusing partial rotation.`);
        }
        const encryptedDek = rewrapKekEncryptedDek(
            row.id,
            row.encrypted_dek,
            version,
            2,
        );
        if (APPLY) {
            await client.query(
                `UPDATE ${table} SET encrypted_dek = $1, kek_version = 2 WHERE id = $2 AND kek_version = $3`,
                [encryptedDek, row.id, version],
            );
        }
        updated += 1;
    }
    return updated;
}

try {
    await client.query("BEGIN");
    const vaults = await rotateTable("vaults");
    const writeRequests = await rotateTable("write_requests");
    if (APPLY) {
        await client.query("COMMIT");
        console.log(`KEK rotation committed. Vaults: ${vaults}; write requests: ${writeRequests}.`);
    } else {
        await client.query("ROLLBACK");
        console.log(`Dry run successful (no changes committed). Vaults to rotate: ${vaults}; write requests to rotate: ${writeRequests}.`);
        console.log("Re-run with --apply to commit the transaction.");
    }
} catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("KEK rotation failed; transaction rolled back.");
    console.error(error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
} finally {
    client.release();
    await pool.end();
}
