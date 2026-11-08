import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

import { db, pool } from "../src/db/client.js";
import { users } from "../src/db/schema/users.js";
import { vaults } from "../src/db/schema/vaults.js";
import { generateSharePassphraseService } from "../src/modules/shares/share-passphrase.service.js";

const ownerId = randomUUID();
const otherOwnerId = randomUUID();
const vaultId = randomUUID();

async function run() {
    try {
        await db.insert(users).values({
            id: ownerId,
            cognitoSub: `passphrase-owner-${ownerId}`,
            email: `passphrase-owner-${ownerId}@example.test`,
            emailVerified: true,
        });
        await db.insert(users).values({
            id: otherOwnerId,
            cognitoSub: `passphrase-other-${otherOwnerId}`,
            email: `passphrase-other-${otherOwnerId}@example.test`,
            emailVerified: true,
        });
        await db.insert(vaults).values({
            id: vaultId,
            ownerId,
            name: "Passphrase generation test",
            description: "Generated passphrases are returned only to the owner",
            encryptedContent: "encrypted-content",
            encryptedDek: "encrypted-dek",
            encryptionNonce: "nonce",
            encryptionTag: "tag",
            status: "ACTIVE",
            overallTtlSeconds: 3600,
            expiryPolicy: "DESTROY",
        });

        await assert.rejects(
            generateSharePassphraseService(vaultId, otherOwnerId),
            (error: unknown) => (error as { statusCode?: number }).statusCode === 404,
        );

        const generated = await generateSharePassphraseService(vaultId, ownerId);
        assert.equal(generated.passphrase.length, 32);
        assert.equal(generated.entropyBits, 192);
        assert.match(generated.passphrase, /^[A-Za-z0-9_-]+$/);
        const second = await generateSharePassphraseService(vaultId, ownerId);
        assert.notEqual(generated.passphrase, second.passphrase);
        console.log("PASS: generated passphrases are owner-scoped, URL-safe and 192-bit");
    } finally {
        await db.delete(vaults).where(eq(vaults.id, vaultId));
        await db.delete(users).where(eq(users.id, ownerId));
        await db.delete(users).where(eq(users.id, otherOwnerId));
        await pool.end();
    }
}

run().catch((error) => {
    console.error("Share passphrase integration test failed:", error);
    process.exitCode = 1;
});
