import http from "node:http";
import crypto from "node:crypto";
const TEST_MODE = process.argv[2] ?? "owner";
const EXPIRY_DESTROY_VAULT_ID = process.env.EXPIRY_DESTROY_VAULT_ID;
const EXPIRY_REVOKE_VAULT_ID = process.env.EXPIRY_REVOKE_VAULT_ID;
const TEST_SHARE_CODE = process.env.TEST_SHARE_CODE;
const TEST_PASSPHRASE =
    process.env.TEST_PASSPHRASE ?? "VaultShare-Integration-Test-2026!";
const CLIENT_ID = "423hhegfeq88sr8oppgr7b10r6";
const CALLBACK_URL = "http://localhost:5174/";
const COGNITO_DOMAIN =
    "https://ap-south-1txn4wax7n.auth.ap-south-1.amazoncognito.com";
const API_URL = "http://localhost:3000/api/v1";

// Existing provisioned accounts
const OWNER_USER_ID = "0fae33e5-c3b0-4c85-b79a-435633edb3fc";
const READER_USER_ID = "21f9553f-e99c-4a0a-ba95-9d627d2e6f46";

const state = crypto.randomBytes(32).toString("hex");
const verifier = crypto.randomBytes(32).toString("base64url");

const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");

const authorizeUrl = new URL(`${COGNITO_DOMAIN}/oauth2/authorize`);

authorizeUrl.search = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: CALLBACK_URL,
    scope: "openid email",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
}).toString();


function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function checkNoEncryptedFields(data) {
    const forbiddenFields = [
        "encryptedContent",
        "encryptedDek",
        "encryptionNonce",
        "encryptionTag",
    ];

    const serialized = JSON.stringify(data);

    for (const field of forbiddenFields) {
        assert(
            !serialized.includes(`"${field}"`),
            `Security failure: API exposed ${field}`,
        );
    }
}

async function apiRequest(path, accessToken, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...options.headers,
        },
    });

    const data = await response.json();

    return {
        status: response.status,
        ok: response.ok,
        data,
    };
}

async function apiRawRequest(path, accessToken, options = {}) {
    return fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            ...options.headers,
        },
    });
}


// --------------------------------------------------
// VAULT CRUD TESTS
// --------------------------------------------------

async function runVaultTests(accessToken) {
    console.log("\n--- Vault CRUD Integration Tests ---");

    const testContent =
        `VaultShare integration test ${crypto.randomUUID()}`;

    // 1. Create vault
    const createResult = await apiRequest(
        "/vaults",
        accessToken,
        {
            method: "POST",
            body: JSON.stringify({
                name: "Integration Test Vault",
                description: "Created by automated API test",
                content: testContent,
                overallTtlSeconds: 3600,
            }),
        },
    );

    async function apiRawRequest(path, accessToken, options = {}) {
        return fetch(`${API_URL}${path}`, {
            ...options,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                ...options.headers,
            },
        });
    }


    assert(createResult.status === 201, "Vault creation failed");

    const vault = createResult.data.data;

    assert(vault?.id, "Created vault ID missing");
    checkNoEncryptedFields(createResult.data);

    console.log("1. Create vault: PASS (201)");
    console.log("2. Create response security: PASS");

    // 2. List vaults
    const listResult = await apiRequest("/vaults", accessToken);

    assert(listResult.status === 200, "Vault listing failed");

    assert(
        Array.isArray(listResult.data.data),
        "Vault list response is not an array",
    );

    assert(
        listResult.data.data.some((item) => item.id === vault.id),
        "Created vault not found in list",
    );

    checkNoEncryptedFields(listResult.data);

    console.log("3. List vaults: PASS (200)");
    console.log("4. List response security: PASS");

    // 3. Retrieve vault and verify decryption
    const getResult = await apiRequest(
        `/vaults/${vault.id}`,
        accessToken,
    );

    assert(getResult.status === 200, "Vault retrieval failed");

    assert(
        getResult.data.data.content === testContent,
        "Decrypted content does not match original content",
    );

    checkNoEncryptedFields(getResult.data);

    console.log("5. Get vault: PASS (200)");
    console.log("6. Content encryption/decryption: PASS");
    console.log("7. Get response security: PASS");

    // 4. Update vault metadata
    const updateResult = await apiRequest(
        `/vaults/${vault.id}`,
        accessToken,
        {
            method: "PATCH",
            body: JSON.stringify({
                name: "Updated Integration Test Vault",
            }),
        },
    );

    assert(updateResult.status === 200, "Vault update failed");

    assert(
        updateResult.data.data.name === "Updated Integration Test Vault",
        "Vault name was not updated",
    );

    checkNoEncryptedFields(updateResult.data);

    console.log("8. Update vault: PASS (200)");
    console.log("9. Update response security: PASS");

    // 5. Verify updated vault still decrypts correctly
    const updatedGetResult = await apiRequest(
        `/vaults/${vault.id}`,
        accessToken,
    );

    assert(
        updatedGetResult.status === 200,
        "Updated vault retrieval failed",
    );

    assert(
        updatedGetResult.data.data.content === testContent,
        "Vault content changed after metadata update",
    );

    console.log("10. Content preserved after update: PASS");

    // 6. Invalid input
    const invalidResult = await apiRequest(
        "/vaults",
        accessToken,
        {
            method: "POST",
            body: JSON.stringify({
                name: "",
                overallTtlSeconds: -1,
            }),
        },
    );

    assert(
        invalidResult.status === 400,
        "Invalid vault input was not rejected with HTTP 400",
    );

    console.log("11. Invalid input rejection: PASS (400)");

    console.log("\nAll Vault CRUD integration tests passed!");
    console.log("Test vault ID:", vault.id);

    return vault.id;
}

// --------------------------------------------------
// SHARE CREATION TESTS
// --------------------------------------------------

async function runShareTests(accessToken, vaultId, ownerId) {
    console.log("\n--- Share Creation Integration Tests ---");

    const passphrase = TEST_PASSPHRASE;
    const sharePayload = {
        readerId: READER_USER_ID,
        permissions: ["READ", "WRITE"],
        maxAccessCount: 5,
        postOpenTtlSeconds: 3600,
        passphrase,
    };

    // 1. Create share
    const createShareResult = await apiRequest(
        `/vaults/${vaultId}/shares`,
        accessToken,
        {
            method: "POST",
            body: JSON.stringify(sharePayload),
        },
    );

    assert(
        createShareResult.status === 201,
        `Share creation failed: ${JSON.stringify(createShareResult.data)}`,
    );

    const share = createShareResult.data.data;

    assert(share?.id, "Share ID missing");
    assert(share?.shareCode, "Share code missing");

    console.log("1. Create share: PASS (201)");

    // 2. Verify Share ID format
    assert(
        typeof share.shareCode === "string" &&
        /^[A-Za-z0-9_-]{32}$/.test(share.shareCode),
        "Share code format is invalid",
    );

    console.log("2. Share ID generation: PASS");

    // 3. Verify reader and permissions
    assert(share.readerId === READER_USER_ID, "Incorrect reader ID");

    assert(
        share.permissions.includes("READ") &&
        share.permissions.includes("WRITE"),
        "READ and WRITE permissions were not saved",
    );

    assert(share.maxAccessCount === 5, "Incorrect access limit");

    assert(
        share.postOpenTtlSeconds === 3600,
        "Incorrect post-open TTL",
    );

    console.log("3. Reader and permissions: PASS");
    console.log("4. Access limit and post-open TTL: PASS");

    // 4. Verify passphrase is never returned
    const serializedShare = JSON.stringify(createShareResult.data);

    assert(
        !serializedShare.includes(passphrase),
        "Security failure: plaintext passphrase exposed",
    );

    assert(
        !serializedShare.toLowerCase().includes("passphrasehash"),
        "Security failure: passphrase hash exposed",
    );

    console.log("5. Passphrase response security: PASS");

    // 5. Verify overall TTL was initialized
    const vaultResult = await apiRequest(
        `/vaults/${vaultId}`,
        accessToken,
    );

    assert(vaultResult.status === 200, "Could not retrieve shared vault");

    const sharedVault = vaultResult.data.data;

    assert(sharedVault.firstSharedAt, "First shared timestamp was not set");
    assert(sharedVault.expiresAt, "Vault expiry timestamp was not set");

    const expectedExpiry =
        new Date(sharedVault.firstSharedAt).getTime() + 3600 * 1000;

    const actualExpiry = new Date(sharedVault.expiresAt).getTime();

    assert(
        Math.abs(actualExpiry - expectedExpiry) < 1000,
        "Overall TTL expiry calculation is incorrect",
    );

    console.log("6. Overall TTL initialization: PASS");

    // 6. Duplicate active share must be rejected
    const duplicateResult = await apiRequest(
        `/vaults/${vaultId}/shares`,
        accessToken,
        {
            method: "POST",
            body: JSON.stringify(sharePayload),
        },
    );

    assert(
        duplicateResult.status === 409,
        `Duplicate share should return 409, received ${duplicateResult.status}`,
    );

    assert(
        duplicateResult.data.error?.code === "ACTIVE_SHARE_EXISTS",
        "Incorrect duplicate share error code",
    );

    console.log("7. Duplicate active share rejection: PASS (409)");

    // 7. Self-sharing must be rejected
    const selfShareResult = await apiRequest(
        `/vaults/${vaultId}/shares`,
        accessToken,
        {
            method: "POST",
            body: JSON.stringify({
                ...sharePayload,
                readerId: ownerId,
            }),
        },
    );

    assert(
        selfShareResult.status === 400,
        "Self-sharing was not rejected",
    );

    console.log("8. Self-sharing rejection: PASS (400)");

    // 8. Unknown reader must be rejected
    const invalidReaderResult = await apiRequest(
        `/vaults/${vaultId}/shares`,
        accessToken,
        {
            method: "POST",
            body: JSON.stringify({
                ...sharePayload,
                readerId: crypto.randomUUID(),
            }),
        },
    );

    assert(
        invalidReaderResult.status === 404,
        "Unknown reader was not rejected",
    );

    console.log("9. Invalid reader rejection: PASS (404)");

    console.log("\nAll Share Creation integration tests passed!");
    console.log("Test share ID:", share.shareCode);
    return {
        shareCode: share.shareCode,
        passphrase,
    };
}

async function runOwnerFileTests(accessToken, vaultId) {
    console.log("\n--- Owner File Integration Tests ---");

    const originalContent = Buffer.from(
        `VaultShare file test ${crypto.randomUUID()}`,
    );

    // 1. Upload a file
    const form = new FormData();
    form.append(
        "file",
        new Blob([originalContent], { type: "text/plain" }),
        "integration-test.txt",
    );

    const uploadResponse = await apiRawRequest(
        `/vaults/${vaultId}/files`,
        accessToken,
        { method: "POST", body: form },
    );

    const uploadResult = await uploadResponse.json();

    assert(
        uploadResponse.status === 201,
        `File upload failed: ${JSON.stringify(uploadResult)}`,
    );

    const file = uploadResult.data;

    assert(file?.id, "Uploaded file ID missing");
    checkNoEncryptedFields(uploadResult);

    console.log("1. File upload: PASS (201)");
    console.log("2. Upload response security: PASS");

    // 2. List files
    const listResponse = await apiRawRequest(
        `/vaults/${vaultId}/files`,
        accessToken,
    );

    const listResult = await listResponse.json();

    assert(listResponse.status === 200, "File listing failed");
    assert(
        listResult.data.files.some((item) => item.id === file.id),
        "Uploaded file missing from listing",
    );

    checkNoEncryptedFields(listResult);

    console.log("3. File listing: PASS (200)");
    console.log("4. Listing response security: PASS");

    // 3. Download and compare original bytes
    const downloadResponse = await apiRawRequest(
        `/vaults/${vaultId}/files/${file.id}/download`,
        accessToken,
    );

    assert(downloadResponse.status === 200, "File download failed");

    const downloadedContent = Buffer.from(
        await downloadResponse.arrayBuffer(),
    );

    assert(
        downloadedContent.equals(originalContent),
        "Downloaded file content differs from original",
    );

    assert(
        downloadResponse.headers.get("x-content-type-options") === "nosniff",
        "Missing nosniff response header",
    );

    console.log("5. File download: PASS (200)");
    console.log("6. File encryption/decryption integrity: PASS");

    console.log("All owner file tests passed!");

    return file.id;
}


async function runShareAccessTests(accessToken) {
    console.log("\n--- Share Access Integration Tests ---");

    assert(TEST_SHARE_CODE, "Set TEST_SHARE_CODE before reader mode.");

    // 1. Open share with correct passphrase
    const openResult = await apiRequest(
        `/shares/${TEST_SHARE_CODE}/open`,
        accessToken,
        {
            method: "POST",
            body: JSON.stringify({
                passphrase: TEST_PASSPHRASE,
            }),
        },
    );

    assert(
        openResult.status === 200,
        `Share opening failed: ${JSON.stringify(openResult.data)}`,
    );

    const openedShare = openResult.data.data;

    assert(
        typeof openedShare.content === "string",
        "READ permission did not return original content",
    );

    assert(
        openedShare.permissions.includes("READ"),
        "READ permission missing",
    );

    assert(
        Number.isInteger(openedShare.successfulOpenCount) &&
        openedShare.successfulOpenCount >= 1,
        "Successful open count was not incremented",
    );

    assert(
        !JSON.stringify(openResult.data).includes("encryptedDek"),
        "Encrypted DEK exposed",
    );

    console.log("1. Valid passphrase and share opening: PASS (200)");
    console.log("2. READ permission content delivery: PASS");
    console.log("3. Successful access count: PASS");

    // 2. Incorrect passphrase must be rejected
    const invalidResult = await apiRequest(
        `/shares/${TEST_SHARE_CODE}/open`,
        accessToken,
        {
            method: "POST",
            body: JSON.stringify({
                passphrase: "DefinitelyWrongPassphrase123!",
            }),
        },
    );

    assert(
        invalidResult.status === 401,
        `Incorrect passphrase should return 401, got ${invalidResult.status}`,
    );

    console.log("4. Incorrect passphrase rejection: PASS (401)");

    // 3. Failed attempts must not consume successful opens
    const secondOpenResult = await apiRequest(
        `/shares/${TEST_SHARE_CODE}/open`,
        accessToken,
        {
            method: "POST",
            body: JSON.stringify({
                passphrase: TEST_PASSPHRASE,
            }),
        },
    );

    assert(
        secondOpenResult.status === 200,
        "Valid passphrase failed after one incorrect attempt",
    );

    assert(
        secondOpenResult.data.data.successfulOpenCount ===
        openedShare.successfulOpenCount + 1,
        "Failed attempt incorrectly consumed an access count",
    );

    console.log("5. Failed attempt does not consume access: PASS");

    console.log("\nAll Share Access integration tests passed!");
}


async function runReaderFileTests(accessToken) {
    console.log("\n--- Reader File Integration Tests ---");

    assert(TEST_SHARE_CODE, "Set TEST_SHARE_CODE.");
    assert(process.env.TEST_FILE_ID, "Set TEST_FILE_ID.");

    const fileId = process.env.TEST_FILE_ID;
    const body = JSON.stringify({ passphrase: TEST_PASSPHRASE });

    // 1. List files through the share
    const listResponse = await apiRawRequest(
        `/shares/${TEST_SHARE_CODE}/files/list`,
        accessToken,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
        },
    );

    const listResult = await listResponse.json();

    assert(
        listResponse.status === 200,
        `Reader file listing failed: ${JSON.stringify(listResult)}`,
    );

    assert(
        listResult.data.files.some((file) => file.id === fileId),
        "Shared file not found in reader listing",
    );

    checkNoEncryptedFields(listResult);

    console.log("1. Reader file listing: PASS (200)");

    // 2. Download shared file
    const downloadResponse = await apiRawRequest(
        `/shares/${TEST_SHARE_CODE}/files/${fileId}/download`,
        accessToken,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
        },
    );

    assert(
        downloadResponse.status === 200,
        `Reader download failed: ${downloadResponse.status}`,
    );

    const downloadedContent = Buffer.from(
        await downloadResponse.arrayBuffer(),
    );

    assert(downloadedContent.length > 0, "Downloaded file is empty");

    assert(
        downloadResponse.headers.get("x-content-type-options") === "nosniff",
        "Missing nosniff header",
    );

    console.log("2. Reader file download: PASS (200)");
    console.log("\nAll reader file tests passed!");
}

// --------------------------------------------------
// COGNITO CALLBACK SERVER
// --------------------------------------------------


const server = http.createServer(async (req, res) => {
    try {
        const callback = new URL(req.url, CALLBACK_URL);

        if (callback.searchParams.get("state") !== state) {
            res.writeHead(400);
            res.end("Invalid state. Authentication rejected.");
            return;
        }

        const error = callback.searchParams.get("error");

        if (error) {
            res.writeHead(400);
            res.end("Cognito authentication failed.");
            console.error("Cognito returned an authentication error.");
            server.close();
            return;
        }

        const code = callback.searchParams.get("code");

        if (!code) {
            res.writeHead(400);
            res.end("Authorization code missing.");
            return;
        }

        // Exchange authorization code for tokens
        const tokenResponse = await fetch(
            `${COGNITO_DOMAIN}/oauth2/token`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({
                    grant_type: "authorization_code",
                    client_id: CLIENT_ID,
                    code,
                    redirect_uri: CALLBACK_URL,
                    code_verifier: verifier,
                }),
            },
        );

        const tokens = await tokenResponse.json();

        if (!tokenResponse.ok || !tokens.access_token) {
            throw new Error("Cognito token exchange failed.");
        }

        console.log("\nToken exchange: SUCCESS");

        // Verify authentication and user provisioning
        const authResult = await apiRequest(
            "/auth/me",
            tokens.access_token,
        );

        assert(
            authResult.status === 200,
            "Authentication API failed",
        );

        const ownerId = authResult.data.data.id;

        // Verify the expected account
        if (
            TEST_MODE === "owner" ||
            TEST_MODE === "auth" ||
            TEST_MODE === "expiry" ||
            TEST_MODE === "expiry-verify"
        ) {
            assert(
                ownerId === OWNER_USER_ID,
                "Authenticated user is not the configured owner",
            );
        } else if (TEST_MODE === "reader") {
            assert(
                ownerId === READER_USER_ID,
                "Sign in using the reader Cognito account.",
            );
        } else {
            throw new Error(
                "Invalid test mode. Use auth, owner, reader, expiry, or expiry-verify.",
            );
        }

        // Verify email status for every mode
        assert(
            authResult.data.data.emailVerified === true,
            "User email is not verified.",
        );

        console.log("User authentication and provisioning: PASS");
        console.log("User ID:", ownerId);
        console.log("Email verified:", authResult.data.data.emailVerified);

        // Authentication-only mode: no vault/share/file operations
        if (TEST_MODE === "auth") {
            console.log("\n========================================");
            console.log("AUTHENTICATION-ONLY TEST: PASSED");
            console.log("========================================");
            console.log("Cognito OAuth authentication: SUCCESS");
            console.log("VaultShare /auth/me: SUCCESS");
            console.log("Owner database ID: VERIFIED");
            console.log("Email verification: VERIFIED");
            console.log("No vaults, shares, or files were created.");

            res.writeHead(200, { "Content-Type": "text/plain" });
            res.end("VaultShare authentication test passed. Check terminal.");
        }
        else if (TEST_MODE === "expiry-verify") {
            console.log("\n=== Owner Access After Expiry Tests ===");

            const destroyResult = await apiRequest(
                `/vaults/${EXPIRY_DESTROY_VAULT_ID}`,
                tokens.access_token,
            );

            console.log("\nDESTROY vault response:");
            console.log("HTTP status:", destroyResult.status);
            console.log(JSON.stringify(destroyResult.data, null, 2));

            const revokeResult = await apiRequest(
                `/vaults/${EXPIRY_REVOKE_VAULT_ID}`,
                tokens.access_token,
            );
            res.writeHead(200, { "Content-Type": "text/plain" });
            res.end("Owner access after expiry verification passed.");

            console.log("\nREVOKE_ACCESS vault response:");
            console.log("HTTP status:", revokeResult.status);
            console.log(JSON.stringify(revokeResult.data, null, 2));

            assert(
                destroyResult.status === 410,
                "DESTROY vault should return HTTP 410 to its owner",
            );

            assert(
                revokeResult.status === 200,
                "REVOKE_ACCESS vault should remain accessible to its owner",
            );

            console.log("\nOWNER ACCESS AFTER EXPIRY: PASSED");
        }
        else if (TEST_MODE === "expiry") {
            const expiryVaults = await createExpiryTestVaults(
                tokens.access_token,
            );

            console.log("\nExpiry test vaults created:");
            console.log("DESTROY:", expiryVaults.destroyVaultId);
            console.log("REVOKE_ACCESS:", expiryVaults.revokeVaultId);

            console.log("\n========================================");
            console.log("EXPIRY TEST SETUP: PASSED");
            console.log("========================================");

            res.writeHead(200, { "Content-Type": "text/plain" });
            res.end("VaultShare expiry test setup passed. Check terminal.");
        }

        // Full owner integration tests
        else if (TEST_MODE === "owner") {
            const vaultId = await runVaultTests(tokens.access_token);

            const share = await runShareTests(
                tokens.access_token,
                vaultId,
                ownerId,
            );

            const fileId = await runOwnerFileTests(
                tokens.access_token,
                vaultId,
            );

            const expiryVaults = await createExpiryTestVaults(
                tokens.access_token,
            );

            console.log("Expiry test vaults:", expiryVaults);
            console.log("\nOWNER TEST COMPLETE");
            console.log("Share Code:", share.shareCode);
            console.log("File ID:", fileId);

            res.writeHead(200, { "Content-Type": "text/plain" });
            res.end("All VaultShare integration tests passed. Check terminal.");
        }

        // Full reader integration tests
        else if (TEST_MODE === "reader") {
            await runShareAccessTests(tokens.access_token);
            await runReaderFileTests(tokens.access_token);

            console.log("\nREADER TEST COMPLETE");

            res.writeHead(200, { "Content-Type": "text/plain" });
            res.end("All VaultShare reader tests passed. Check terminal.");
        }

        server.close();
    } catch (error) {
        console.error("\nIntegration test failed:", error.message);

        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Integration test failed. Check terminal output.");

        server.close();
    }
});

server.listen(5174, "127.0.0.1", () => {
    console.log("Temporary callback server running on port 5174.");
    console.log("\nOpen this URL in your browser:\n");
    console.log(authorizeUrl.toString());
});



async function createExpiryTestVaults(accessToken) {
    console.log("\n=== Vault Expiry Tests ===");

    const passphrase = TEST_PASSPHRASE;

    // Create DESTROY vault
    const destroyResult = await apiRequest(
        "/vaults",
        accessToken,
        {
            method: "POST",
            body: JSON.stringify({
                name: "Expiry Test - DESTROY",
                content: "Temporary secret for destruction test",
                overallTtlSeconds: 60,
                expiryPolicy: "DESTROY",
            }),
        }
    );

    assert(
        destroyResult.status === 201,
        `DESTROY vault creation failed: ${JSON.stringify(destroyResult.data)}`
    );

    const destroyVaultId = destroyResult.data.data.id;

    // Create REVOKE_ACCESS vault
    const revokeResult = await apiRequest(
        "/vaults",
        accessToken,
        {
            method: "POST",
            body: JSON.stringify({
                name: "Expiry Test - REVOKE",
                content: "Retained secret for revocation test",
                overallTtlSeconds: 60,
                expiryPolicy: "REVOKE_ACCESS",
            }),
        }
    );

    assert(
        revokeResult.status === 201,
        `REVOKE vault creation failed: ${JSON.stringify(revokeResult.data)}`
    );

    const revokeVaultId = revokeResult.data.data.id;

    // Share both vaults to initialize their overall TTL
    for (const vaultId of [destroyVaultId, revokeVaultId]) {
        const shareResult = await apiRequest(
            `/vaults/${vaultId}/shares`,
            accessToken,
            {
                method: "POST",
                body: JSON.stringify({
                    readerId: READER_USER_ID,
                    permissions: ["READ"],
                    maxAccessCount: 5,
                    postOpenTtlSeconds: 3600,
                    passphrase,
                }),
            }
        );

        assert(
            shareResult.status === 201,
            `Expiry test share creation failed: ${JSON.stringify(shareResult.data)}`
        );
    }

    console.log("DESTROY vault ID:", destroyVaultId);
    console.log("REVOKE vault ID:", revokeVaultId);

    return { destroyVaultId, revokeVaultId };
}
