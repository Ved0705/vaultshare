import http from "node:http";
import crypto from "node:crypto";
const TEST_MODE = process.argv[2] ?? "owner";
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
        openedShare.successfulOpenCount === 1,
        "Successful open count should be 1",
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
        secondOpenResult.data.data.successfulOpenCount === 2,
        "Failed attempt incorrectly consumed an access count",
    );

    console.log("5. Failed attempt does not consume access: PASS");

    console.log("\nAll Share Access integration tests passed!");
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
        if (TEST_MODE === "owner") {
            assert(ownerId === OWNER_USER_ID, "Sign in using the owner account.");
        } else if (TEST_MODE === "reader") {
            assert(ownerId === READER_USER_ID, "Sign in using the reader account.");
        } else {
            throw new Error("Invalid test mode.");
        }
        console.log("User authentication and provisioning: PASS");
        console.log("User ID:", ownerId);
        console.log("Email verified:", authResult.data.data.emailVerified);

        // Ensure the owner account is being used

        assert(
            authResult.data.data.emailVerified === true,
            "Owner email is not verified",
        );

        if (TEST_MODE === "owner") {
            const vaultId = await runVaultTests(tokens.access_token);

            const share = await runShareTests(
                tokens.access_token,
                vaultId,
                ownerId,
            );

            console.log("\nOWNER TEST COMPLETE");
            console.log("Share Code:", share.shareCode);
        } else {
            await runShareAccessTests(tokens.access_token);
        }

        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("All VaultShare integration tests passed. Check terminal.");

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
