
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";

import { db, pool } from "../src/db/client.js";
import { users } from "../src/db/schema/users.js";
import { vaults } from "../src/db/schema/vaults.js";
import { shares } from "../src/db/schema/shares.js";
import { passphraseAttempts } from "../src/db/schema/passphrase-attempts.js";

import { createShareService } from "../src/modules/shares/share.service.js";
import { openShareService } from "../src/modules/shares/share-access.service.js";
import { extendShareAccessService } from "../src/modules/shares/share-extension.service.js";
import { updateVaultService } from "../src/modules/vaults/vault.service.js";

const ownerId = randomUUID();
const readerIds: string[] = [];
const vaultIds: string[] = [];
const shareIds: string[] = [];

async function createFixture(options?: {
    maxAccessCount?: number;
    postOpenTtlSeconds?: number | null;
}) {
    const readerId = randomUUID();
    const vaultId = randomUUID();

    readerIds.push(readerId);
    vaultIds.push(vaultId);

    await db.insert(users).values({
        id: readerId,
        cognitoSub: `share-access-${readerId}`,
        email: `share-access-${readerId}@example.test`,
        emailVerified: true,
    });

    await db.insert(vaults).values({
        id: vaultId,
        ownerId,
        name: "Share access integration test",
        description: "Test fixture",
        encryptedContent: "unused-test-content",
        encryptedDek: "unused-test-dek",
        encryptionNonce: "test-nonce",
        encryptionTag: "test-tag",
        status: "ACTIVE",
        overallTtlSeconds: 3600,
        firstSharedAt: null,
        expiresAt: null,
        expiryPolicy: "REVOKE_ACCESS",
    });

    const passphrase = "Correct-Test-Passphrase-123!";

    const share = await createShareService({
        vaultId,
        ownerId,
        readerId,
        permissions: ["WRITE"],
        maxAccessCount: options?.maxAccessCount ?? 5,
        postOpenTtlSeconds: options?.postOpenTtlSeconds ?? null,
        passphrase,
    });

    shareIds.push(share.id);

    return {
        readerId,
        vaultId,
        shareId: share.id,
        shareCode: share.shareCode,
        passphrase,
    };
}

async function expectAppError(
    operation: Promise<unknown>,
    statusCode: number,
    code: string,
) {
    await assert.rejects(operation, (error: unknown) => {
        assert.equal(
            (error as { statusCode?: number }).statusCode,
            statusCode,
        );
        assert.equal(
            (error as { code?: string }).code,
            code,
        );
        return true;
    });
}

async function run() {
    try {
        await db.insert(users).values({
            id: ownerId,
            cognitoSub: `share-access-owner-${ownerId}`,
            email: `share-access-owner-${ownerId}@example.test`,
            emailVerified: true,
        });

        // 1. Successful opens increment the access count and start TTL once.
        {
            const fixture = await createFixture({
                maxAccessCount: 3,
                postOpenTtlSeconds: 600,
            });

            const first = await openShareService({
                shareCode: fixture.shareCode,
                readerId: fixture.readerId,
                passphrase: fixture.passphrase,
            });

            assert.equal(first.successfulOpenCount, 1);
            assert.equal(first.remainingAccesses, 2);
            assert.ok(first.postOpenExpiresAt);

            const originalExpiry = first.postOpenExpiresAt.getTime();

            const second = await openShareService({
                shareCode: fixture.shareCode,
                readerId: fixture.readerId,
                passphrase: fixture.passphrase,
            });

            assert.equal(second.successfulOpenCount, 2);
            assert.equal(second.remainingAccesses, 1);
            assert.equal(second.postOpenExpiresAt?.getTime(), originalExpiry);

            console.log("PASS: successful opens increment access count");
            console.log("PASS: first open starts post-open TTL only once");
        }

        // 2. Failed passphrases are recorded but do not consume access.
        // Five failures are allowed; the next attempt is rate limited.
        {
            const fixture = await createFixture({ maxAccessCount: 5 });

            for (let attempt = 1; attempt <= 5; attempt++) {
                await expectAppError(
                    openShareService({
                        shareCode: fixture.shareCode,
                        readerId: fixture.readerId,
                        passphrase: "Wrong-Passphrase",
                    }),
                    401,
                    "INVALID_PASSPHRASE",
                );
            }

            const [share] = await db
                .select()
                .from(shares)
                .where(eq(shares.id, fixture.shareId));

            assert.ok(share);
            assert.equal(share.successfulOpenCount, 0);

            const attempts = await db
                .select()
                .from(passphraseAttempts)
                .where(
                    and(
                        eq(passphraseAttempts.shareId, fixture.shareId),
                        eq(passphraseAttempts.userId, fixture.readerId),
                        eq(passphraseAttempts.succeeded, false),
                    ),
                );

            assert.equal(attempts.length, 5);

            await expectAppError(
                openShareService({
                    shareCode: fixture.shareCode,
                    readerId: fixture.readerId,
                    passphrase: "Another-Wrong-Passphrase",
                }),
                429,
                "TOO_MANY_PASSPHRASE_ATTEMPTS",
            );

            console.log("PASS: failed passphrases do not consume access");
            console.log("PASS: five failed attempts trigger rate limiting");
        }

        // 3. Reaching the configured access limit blocks further opens.
        {
            const fixture = await createFixture({ maxAccessCount: 1 });

            const first = await openShareService({
                shareCode: fixture.shareCode,
                readerId: fixture.readerId,
                passphrase: fixture.passphrase,
            });

            assert.equal(first.successfulOpenCount, 1);
            assert.equal(first.remainingAccesses, 0);

            const [exhaustedShare] = await db
                .select()
                .from(shares)
                .where(eq(shares.id, fixture.shareId));
            assert.ok(exhaustedShare);
            assert.equal(
                exhaustedShare.status,
                "expired",
                "Final permitted open should exhaust the share",
            );

            await expectAppError(
                openShareService({
                    shareCode: fixture.shareCode,
                    readerId: fixture.readerId,
                    passphrase: fixture.passphrase,
                }),
                410,
                "ACCESS_LIMIT_REACHED",
            );

            console.log("PASS: access limit blocks additional opens");
        }

        // 4. Concurrent opens cannot exceed the configured access limit.
        {
            const fixture = await createFixture({ maxAccessCount: 1 });

            const results = await Promise.allSettled([
                openShareService({
                    shareCode: fixture.shareCode,
                    readerId: fixture.readerId,
                    passphrase: fixture.passphrase,
                }),
                openShareService({
                    shareCode: fixture.shareCode,
                    readerId: fixture.readerId,
                    passphrase: fixture.passphrase,
                }),
            ]);

            const successful = results.filter(
                (result) => result.status === "fulfilled",
            );
            const rejected = results.filter(
                (result) => result.status === "rejected",
            );

            assert.equal(successful.length, 1);
            assert.equal(rejected.length, 1);
            assert.equal(
                (rejected[0] as PromiseRejectedResult).reason.code,
                "ACCESS_LIMIT_REACHED",
            );

            const [share] = await db
                .select()
                .from(shares)
                .where(eq(shares.id, fixture.shareId));

            assert.ok(share);
            assert.equal(share.successfulOpenCount, 1);
            assert.equal(share.status, "expired");

            console.log("PASS: concurrent opens cannot exceed access limit");
            console.log("PASS: final successful open transitions share to expired");
        }

        // 5. Expired post-open shares reject further access.
        {
            const fixture = await createFixture({
                maxAccessCount: 5,
                postOpenTtlSeconds: 600,
            });

            await db
                .update(shares)
                .set({
                    firstOpenedAt: new Date(Date.now() - 120_000),
                    postOpenExpiresAt: new Date(Date.now() - 60_000),
                    successfulOpenCount: 1,
                    updatedAt: new Date(),
                })
                .where(eq(shares.id, fixture.shareId));

            await expectAppError(
                openShareService({
                    shareCode: fixture.shareCode,
                    readerId: fixture.readerId,
                    passphrase: fixture.passphrase,
                }),
                410,
                "SHARE_EXPIRED",
            );

            console.log("PASS: expired post-open shares reject access");
        }

        // 6. Owners can grant additional opens after count exhaustion,
        // but cannot renew after the reader's post-open TTL has expired.
        {
            const fixture = await createFixture({
                maxAccessCount: 1,
                postOpenTtlSeconds: 600,
            });

            const firstOpen = await openShareService({
                shareCode: fixture.shareCode,
                readerId: fixture.readerId,
                passphrase: fixture.passphrase,
            });

            const renewed = await extendShareAccessService({
                vaultId: fixture.vaultId,
                shareId: fixture.shareId,
                ownerId,
                additionalAccesses: 2,
                extendPostOpenBySeconds: 120,
            });

            assert.equal(renewed.status, "active");
            assert.equal(renewed.maxAccessCount, 3);
            assert.equal(renewed.postOpenExpiresAt?.getTime(), firstOpen.postOpenExpiresAt!.getTime() + 120_000);

            const secondOpen = await openShareService({
                shareCode: fixture.shareCode,
                readerId: fixture.readerId,
                passphrase: fixture.passphrase,
            });
            assert.equal(secondOpen.successfulOpenCount, 2);

            console.log("PASS: owner can extend an exhausted access count");
        }

        // 7. A reader cannot regain access by receiving a new share after
        // their post-open TTL has expired.
        {
            const fixture = await createFixture({
                maxAccessCount: 5,
                postOpenTtlSeconds: 600,
            });

            await openShareService({
                shareCode: fixture.shareCode,
                readerId: fixture.readerId,
                passphrase: fixture.passphrase,
            });

            await db
                .update(shares)
                .set({
                    status: "expired",
                    postOpenExpiresAt: new Date(Date.now() - 1000),
                    updatedAt: new Date(),
                })
                .where(eq(shares.id, fixture.shareId));

            await assert.rejects(
                createShareService({
                    vaultId: fixture.vaultId,
                    ownerId,
                    readerId: fixture.readerId,
                    permissions: ["READ"],
                    maxAccessCount: 5,
                    postOpenTtlSeconds: 600,
                    passphrase: fixture.passphrase,
                }),
                (error: unknown) => {
                    assert.equal((error as { statusCode?: number }).statusCode, 410);
                    assert.equal((error as { code?: string }).code, "READER_ACCESS_PERMANENTLY_EXPIRED");
                    return true;
                },
            );

            console.log("PASS: expired reader cannot regain access through re-sharing");
        }

        // 8. Vault metadata is editable before first open and immutable after.
        {
            const fixture = await createFixture();

            await updateVaultService(fixture.vaultId, ownerId, {
                name: "Updated before first open",
            });

            await openShareService({
                shareCode: fixture.shareCode,
                readerId: fixture.readerId,
                passphrase: fixture.passphrase,
            });

            await assert.rejects(
                updateVaultService(fixture.vaultId, ownerId, {
                    name: "Must not be applied",
                }),
                (error: unknown) => {
                    assert.equal((error as { statusCode?: number }).statusCode, 409);
                    assert.equal((error as { code?: string }).code, "VAULT_IMMUTABLE");
                    return true;
                },
            );

            console.log("PASS: vault metadata becomes immutable after first reader open");
        }

        console.log("\nAll share-access integration tests passed.");
    } finally {
        if (shareIds.length > 0) {
            await db.delete(passphraseAttempts).where(
                inArray(passphraseAttempts.shareId, shareIds),
            );
            await db.delete(shares).where(inArray(shares.id, shareIds));
        }

        if (vaultIds.length > 0) {
            await db.delete(vaults).where(inArray(vaults.id, vaultIds));
        }

        if (readerIds.length > 0) {
            await db.delete(users).where(inArray(users.id, readerIds));
        }

        await db.delete(users).where(eq(users.id, ownerId));
        await pool.end();
    }
}

run().catch((error) => {
    console.error("Share access integration test failed:", error);
    process.exitCode = 1;
});
