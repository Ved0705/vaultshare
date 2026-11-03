
import http from "node:http";
import crypto from "node:crypto";

const CLIENT_ID = "423hhegfeq88sr8oppgr7b10r6";
const CALLBACK_URL = "http://localhost:5174/";
const COGNITO_DOMAIN =
    "https://ap-south-1txn4wax7n.auth.ap-south-1.amazoncognito.com";

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

        const apiResponse = await fetch(
            "http://localhost:3000/api/v1/auth/me",
            {
                headers: {
                    Authorization: `Bearer ${tokens.access_token}`,
                },
            },
        );

        const result = await apiResponse.json();

        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("Authentication test completed. Check your terminal.");

        console.log("\n--- Cognito Authentication Test ---");
        console.log("Token exchange: SUCCESS");
        console.log("API HTTP status:", apiResponse.status);
        console.log("API response:", result);

        console.log(
            apiResponse.ok
                ? "\nSUCCESS: Cognito authentication and user provisioning worked!"
                : "\nFAILED: Backend rejected the request.",
        );

        server.close();
    } catch {
        res.writeHead(500);
        res.end("Authentication test failed. Check terminal output.");
        console.error("Authentication test failed.");
        server.close();
    }
});

server.listen(5174, "127.0.0.1", () => {
    console.log("Temporary callback server running on port 5174.");
    console.log("\nOpen this URL in your browser:\n");
    console.log(authorizeUrl.toString());
});
