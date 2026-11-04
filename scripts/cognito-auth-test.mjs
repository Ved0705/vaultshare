
import http from "node:http";
import crypto from "node:crypto";

const CLIENT_ID = "423hhegfeq88sr8oppgr7b10r6";
const CALLBACK_URL = "http://localhost:5174/";
const COGNITO_DOMAIN =
    "https://ap-south-1txn4wax7n.auth.ap-south-1.amazoncognito.com";
const API_URL = "http://localhost:3000/api/v1";

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

async function runVaultTests(accessToken) {
    console.log("\n--- Vault CRUD Integration Tests ---");

    // 1. Create vault
    const testContent =
        `VaultShare integration test ${crypto.randomUUID()}`;

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
    const listResult = await apiRequest(
        "/vaults",
        accessToken,
    );

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

    assert(updatedGetResult.status === 200, "Updated vault retrieval failed");

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
}

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

        assert(authResult.status === 200, "Authentication API failed");

        console.log("User authentication and provisioning: PASS");
        console.log("User ID:", authResult.data.data.id);
        console.log("Email verified:", authResult.data.data.emailVerified);

        // Run Vault CRUD tests
        await runVaultTests(tokens.access_token);

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
