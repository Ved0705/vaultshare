
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";

import { db, pool } from "../src/db/client.js";
import { users } from "../src/db/schema/users.js";
import { vaults } from "../src/db/schema/vaults.js";
import { shares } from "../src/db/schema/shares.js";
import { writeRequests } from "../src/db/schema/write-requests.js";
import { vaultLineage } from "../src/db/schema/vault-lineage.js";
import { revokeShareService } from "../src/modules/shares/share-revocation.service.js";

async function main() {
    const ownerId = randomUUID();
    const readerOneId = randomUUID();
    const readerTwoId = randomUUID();
    const sourceVaultId = randomUUID();
    const derivedVaultId = randomUUID();
    const shareOneId = randomUUID();
    const shareTwoId = randomUUID();
    const requestId = randomUUID();

    const vaultPayload = {
        encryptedContent: "encrypted-test-content",
        encryptedDek: "encrypted-test-dek",
        encryptionNonce: "test-nonce",
        encryptionTag: "test-tag",
    };

    try {
        await db.insert(users).values([
            {
                id: ownerId,
                cognitoSub: `isolation-owner-${randomUUID()}`,
                email: `isolation-owner-${randomUUID()}@example.test`,
            },
            {
                id: readerOneId,
                cognitoSub: `isolation-reader1-${randomUUID()}`,
                email: `isolation-reader1-${randomUUID()}@example.test`,
            },
            {
                id: readerTwoId,
                cognitoSub: `isolation-reader2-${randomUUID()}`,
                email: `isolation-reader2-${randomUUID()}@example.test`,
            },
        ]);

        await db.insert(vaults).values([
            {
                id: sourceVaultId,
                ownerId,
                name: "Isolation test source",
                description: null,
                ...vaultPayload,
                status: "ACTIVE",
                overallTtlSeconds: 3600,
                firstSharedAt: null,
                expiresAt: null,
                expiryPolicy: "REVOKE_ACCESS",
            },
            {
                id: derivedVaultId,
                ownerId: readerOneId,
                name: "Isolation test derived",
                description: null,
                encryptedContent: "derived-encrypted-content",
                encryptedDek: "derived-encrypted-dek",
                encryptionNonce: "derived-nonce",
                encryptionTag: "derived-tag",
                status: "ACTIVE",
                overallTtlSeconds: 3600,
                firstSharedAt: null,
                expiresAt: null,
                expiryPolicy: "DESTROY",
            },
        ]);

        await db.insert(shares).values([
            {
                id: shareOneId,
                shareCode: randomUUID().replaceAll("-", "").slice(0, 32),
                vaultId: sourceVaultId,
                readerId: readerOneId,
                permissions: ["READ", "WRITE"],
                status: "active",
                maxAccessCount: 5,
                successfulOpenCount: 0,
            },
            {
                id: shareTwoId,
                shareCode: randomUUID().replaceAll("-", "").slice(0, 32),
                vaultId: sourceVaultId,
                readerId: readerTwoId,
                permissions: ["READ"],
                status: "active",
                maxAccessCount: 5,
                successfulOpenCount: 0,
            },
        ]);

        await db.insert(writeRequests).values({
            id: requestId,
            shareId: shareOneId,
            sourceVaultId,
            requestedBy: readerOneId,
            status: "APPROVED",
            encryptedContent: "",
            encryptedDek: "",
            encryptionNonce: "",
            encryptionTag: "",
            derivedVaultId,
            reviewedBy: ownerId,
            reviewedAt: new Date(),
        });

        await db.insert(vaultLineage).values({
            sourceVaultId,
            derivedVaultId,
            writeRequestId: requestId,
            createdBy: ownerId,
        });

        const result = await revokeShareService(
            sourceVaultId,
            shareOneId,
            ownerId,
        );

        // @ts-ignore
        assert.equal(result.status, "revoked");

        const [revokedShare] = await db
            .select()
            .from(shares)
            .where(eq(shares.id, shareOneId));

        const [untouchedShare] = await db
            .select()
            .from(shares)
            .where(eq(shares.id, shareTwoId));

        const vaultRows = await db
            .select()
            .from(vaults)
            .where(inArray(vaults.id, [sourceVaultId, derivedVaultId]));

        const source = vaultRows.find((v) => v.id === sourceVaultId);
        const derived = vaultRows.find((v) => v.id === derivedVaultId);

        assert.ok(revokedShare);
        assert.ok(untouchedShare);
        assert.ok(source);
        assert.ok(derived);

        assert.equal(revokedShare.status, "revoked");
        assert.ok(revokedShare.revokedAt);

        assert.equal(untouchedShare.status, "active");

        assert.equal(source.status, "ACTIVE");
        assert.equal(source.encryptedContent, vaultPayload.encryptedContent);
        assert.equal(source.encryptedDek, vaultPayload.encryptedDek);

        assert.equal(derived.status, "ACTIVE");
        assert.equal(derived.encryptedContent, "derived-encrypted-content");
        assert.equal(derived.encryptedDek, "derived-encrypted-dek");

        const [lineage] = await db
            .select()
            .from(vaultLineage)
            .where(eq(vaultLineage.derivedVaultId, derivedVaultId));

        assert.ok(lineage, "Individual share revocation must preserve lineage");

        console.log("PASS: selected reader share is revoked.");
        console.log("PASS: other reader share remains active.");
        console.log("PASS: source vault payload remains intact.");
        console.log("PASS: derived vault and lineage remain intact.");
    } finally {
        await db.delete(vaultLineage).where(
            eq(vaultLineage.sourceVaultId, sourceVaultId),
        );

        await db.delete(writeRequests).where(
            eq(writeRequests.id, requestId),
        );

        await db.delete(shares).where(
            inArray(shares.id, [shareOneId, shareTwoId]),
        );

        await db.delete(vaults).where(
            inArray(vaults.id, [sourceVaultId, derivedVaultId]),
        );

        await db.delete(users).where(
            inArray(users.id, [ownerId, readerOneId, readerTwoId]),
        );

        await pool.end();
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
