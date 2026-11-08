import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { randomBytes, randomUUID } from "node:crypto";

const testKey = Buffer.alloc(32, 9).toString("base64");
Object.assign(process.env, {
    NODE_ENV: "test", PORT: "3000", CORS_ORIGINS: "http://localhost:5173",
    TRUST_PROXY_HOPS: "0", COGNITO_USERINFO_URL: "https://example.test/userinfo",
    DATABASE_URL: "postgres://user:pass@127.0.0.1:5433/vaultshare",
    STORAGE_PATH: "./private-storage-security-test", MAIL_HOST: "localhost", MAIL_PORT: "1025",
    MAIL_FROM: "no-reply@example.test", COGNITO_REGION: "ap-south-1",
    COGNITO_USER_POOL_ID: "ap-south-1_example", COGNITO_CLIENT_ID: "security-test-client",
    VAULT_KEK_BASE64: testKey, VAULT_KEK_V2_BASE64: "", VAULT_KEK_CURRENT_VERSION: "1",
});

const [{ db, pool }, { users }, { vaults }, { files }, { auditEvents }, { revokedAccessTokens },
    { auditRequest }, { logoutController }, { isAccessTokenRevoked },
    { getVaultService }, { listVaultFilesService, downloadFileService, uploadFileService },
    { errorHandler }] = await Promise.all([
    import("../src/db/client.js"),
    import("../src/db/schema/users.js"),
    import("../src/db/schema/vaults.js"),
    import("../src/db/schema/files.js"),
    import("../src/db/schema/audit-events.js"),
    import("../src/db/schema/revoked-access-tokens.js"),
    import("../src/middleware/audit.middleware.js"),
    import("../src/modules/users/auth-session.controller.js"),
    import("../src/middleware/token-revocation.js"),
    import("../src/modules/vaults/vault.service.js"),
    import("../src/modules/files/file.service.js"),
    import("../src/middleware/error-handler.js"),
]);
const ownerId = randomUUID();
const otherUserId = randomUUID();
const vaultIds: string[] = [];
const fileIds: string[] = [];
const jtis: string[] = [];

function expectAppError(operation: Promise<unknown>, statusCode: number, code: string) {
    return assert.rejects(operation, (error: unknown) => {
        assert.equal((error as { statusCode?: number }).statusCode, statusCode);
        assert.equal((error as { code?: string }).code, code);
        return true;
    });
}

async function createVault(owner: string, name: string) {
    const id = randomUUID();
    vaultIds.push(id);
    await db.insert(vaults).values({
        id, ownerId: owner, name, description: "security regression fixture",
        encryptedContent: "fixture", encryptedDek: "fixture-dek",
        encryptionNonce: "nonce", encryptionTag: "tag",
        status: "ACTIVE", overallTtlSeconds: 3600, firstSharedAt: null,
        expiresAt: null, expiryPolicy: "REVOKE_ACCESS",
    });
    return id;
}

async function main() {
    try {
        await db.insert(users).values([
            { id: ownerId, cognitoSub: `security-owner-${ownerId}`, email: `security-owner-${ownerId}@example.test`, emailVerified: true },
            { id: otherUserId, cognitoSub: `security-other-${otherUserId}`, email: `security-other-${otherUserId}@example.test`, emailVerified: true },
        ]);

        // Audit writes are emitted after the response finishes and contain route metadata, not request secrets.
        const auditVaultId = await createVault(ownerId, "audit fixture");
        const auditReq = {
            method: "GET", path: `/api/v1/vaults/${auditVaultId}`,
            route: { path: "/:id" },
            user: { id: ownerId, cognitoSub: `security-owner-${ownerId}` },
        };
        const auditRes = new EventEmitter() as EventEmitter & { statusCode: number };
        auditRes.statusCode = 200;
        let nextCalled = false;
        auditRequest(auditReq as never, auditRes as never, () => { nextCalled = true; });
        assert.equal(nextCalled, true);
        auditRes.emit("finish");
        let auditRows: Array<typeof auditEvents.$inferSelect> = [];
        for (let attempt = 0; attempt < 20 && auditRows.length === 0; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 25));
            auditRows = await db.select().from(auditEvents).where(
                (await import("drizzle-orm")).eq(auditEvents.actorUserId, ownerId),
            );
        }
        const persistedAudit = auditRows.find((row) => row.route === "/:id" && row.method === "GET");
        assert.ok(persistedAudit, "authenticated request should persist an audit event");
        assert.equal(persistedAudit.statusCode, 200);
        assert.equal(persistedAudit.resourceId, auditVaultId);
        console.log("PASS: authenticated API request is persisted in audit history");

        // Logout stores the presented access-token jti; the same lookup is used by authenticate().
        const jti = `security-logout-${randomUUID()}`;
        jtis.push(jti);
        let responseStatus = 0;
        let responseSent = false;
        const logoutReq = { user: { jti, tokenExpiresAt: new Date(Date.now() + 60_000) } };
        const logoutRes = {
            status(code: number) { responseStatus = code; return this; },
            send() { responseSent = true; return this; },
        };
        await new Promise<void>((resolve, reject) => {
            logoutController(logoutReq as never, logoutRes as never, (error?: unknown) => error ? reject(error) : resolve());
            const poll = async () => {
                try {
                    for (let attempt = 0; attempt < 20; attempt++) {
                        if (await isAccessTokenRevoked(jti)) return resolve();
                        await new Promise((done) => setTimeout(done, 25));
                    }
                    reject(new Error("Logout did not persist token revocation"));
                } catch (error) { reject(error); }
            };
            void poll();
        });
        assert.equal(responseStatus, 204);
        assert.equal(responseSent, true);
        assert.equal(await isAccessTokenRevoked(jti), true);
        console.log("PASS: logout persists revocation used by authentication middleware");

        // Cross-user vault and file operations must not disclose another owner's resources.
        const privateVaultId = await createVault(ownerId, "private owner vault");
        await expectAppError(getVaultService(privateVaultId, otherUserId), 404, "VAULT_NOT_FOUND");
        await expectAppError(listVaultFilesService({
            vaultId: privateVaultId, ownerId: otherUserId, limit: 20, offset: 0,
        }), 404, "VAULT_NOT_FOUND");
        const privateFileId = randomUUID();
        fileIds.push(privateFileId);
        await db.insert(files).values({
            id: privateFileId, vaultId: privateVaultId, originalName: "private.txt",
            mimeType: "text/plain", sizeBytes: 4, storageKey: randomBytes(32).toString("hex"),
            encryptedDek: "fixture", encryptionNonce: "nonce", encryptionTag: "tag", status: "ACTIVE",
        });
        await expectAppError(downloadFileService({
            vaultId: privateVaultId, fileId: privateFileId, ownerId: otherUserId,
        }), 404, "FILE_NOT_FOUND");
        console.log("PASS: cross-user vault listing, retrieval and file download are denied");

        // Quota checks are serialized by the vault row lock and reject before blob storage.
        const countVaultId = await createVault(ownerId, "file count quota fixture");
        const quotaRows = Array.from({ length: 100 }, () => ({
            id: randomUUID(), vaultId: countVaultId, originalName: "quota.txt",
            mimeType: "text/plain", sizeBytes: 1, storageKey: randomBytes(32).toString("hex"),
            encryptedDek: "fixture", encryptionNonce: "nonce", encryptionTag: "tag", status: "ACTIVE",
        }));
        fileIds.push(...quotaRows.map((row) => row.id));
        await db.insert(files).values(quotaRows);
        await expectAppError(uploadFileService({
            vaultId: countVaultId, ownerId,
            file: { originalname: "overflow.txt", mimetype: "text/plain", size: 1, buffer: Buffer.alloc(1) } as Express.Multer.File,
        }), 413, "VAULT_FILE_COUNT_LIMIT");

        const byteVaultId = await createVault(ownerId, "storage quota fixture");
        const byteFileId = randomUUID();
        fileIds.push(byteFileId);
        await db.insert(files).values({
            id: byteFileId, vaultId: byteVaultId, originalName: "large.bin",
            mimeType: "application/octet-stream", sizeBytes: 100 * 1024 * 1024,
            storageKey: randomBytes(32).toString("hex"), encryptedDek: "fixture",
            encryptionNonce: "nonce", encryptionTag: "tag", status: "ACTIVE",
        });
        await expectAppError(uploadFileService({
            vaultId: byteVaultId, ownerId,
            file: { originalname: "overflow.bin", mimetype: "application/octet-stream", size: 1, buffer: Buffer.alloc(1) } as Express.Multer.File,
        }), 413, "VAULT_STORAGE_LIMIT");
        console.log("PASS: 100-file and 100-MiB vault quotas reject excess uploads");

        // Unhandled exceptions must return a generic response without exposing internals.
        let errorBody: Record<string, unknown> = {};
        let errorStatus = 0;
        const errorReq = { method: "GET", log: { error() {}, warn() {} } };
        const errorRes = {
            status(code: number) { errorStatus = code; return this; },
            json(body: Record<string, unknown>) { errorBody = body; return this; },
        };
        errorHandler(new Error("secret database host and password"), errorReq as never, errorRes as never, (() => undefined) as never);
        assert.equal(errorStatus, 500);
        assert.equal(JSON.stringify(errorBody).includes("secret database host"), false);
        assert.equal((errorBody.error as { code?: string }).code, "INTERNAL_SERVER_ERROR");
        console.log("PASS: unexpected errors return a sanitized 500 response");
        console.log("\nSecurity regression integration tests passed.");
    } finally {
        if (fileIds.length) await db.delete(files).where((await import("drizzle-orm")).inArray(files.id, fileIds));
        if (vaultIds.length) await db.delete(vaults).where((await import("drizzle-orm")).inArray(vaults.id, vaultIds));
        if (jtis.length) await db.delete(revokedAccessTokens).where((await import("drizzle-orm")).inArray(revokedAccessTokens.jti, jtis));
        await db.delete(auditEvents).where((await import("drizzle-orm")).eq(auditEvents.actorUserId, ownerId));
        await db.delete(users).where((await import("drizzle-orm")).inArray(users.id, [ownerId, otherUserId]));
        await pool.end();
    }
}

main().catch((error) => {
    console.error("Security regression integration tests failed:", error);
    process.exitCode = 1;
});
