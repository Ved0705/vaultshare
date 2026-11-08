import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { after, before, test } from "node:test";
import pino from "pino";

const testKey = Buffer.alloc(32, 7).toString("base64");
Object.assign(process.env, {
    NODE_ENV: "production", PORT: "3000", CORS_ORIGINS: "https://client.example",
    TRUST_PROXY_HOPS: "0", COGNITO_USERINFO_URL: "https://example.com/userinfo",
    DATABASE_URL: "postgres://user:pass@127.0.0.1:5433/vaultshare",
    STORAGE_PATH: "./private-storage-test", MAIL_HOST: "localhost", MAIL_PORT: "1025",
    MAIL_FROM: "no-reply@example.com", COGNITO_REGION: "ap-south-1",
    COGNITO_USER_POOL_ID: "ap-south-1_example", COGNITO_CLIENT_ID: "exampleclient",
    VAULT_KEK_BASE64: testKey, VAULT_KEK_V2_BASE64: "", VAULT_KEK_CURRENT_VERSION: "1",
});

const { default: app } = await import("../src/app.js");
const { sensitiveLogRedactionPaths } = await import("../src/config/logger.js");
let server: ReturnType<typeof app.listen>;
let baseUrl = "";

before(async () => {
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    baseUrl = `http://127.0.0.1:${address.port}`;
});
after(async () => new Promise<void>((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve()),
));

test("production security headers and CORS allowlist are enforced", async () => {
    const allowed = await fetch(`${baseUrl}/health`, { headers: { Origin: "https://client.example" } });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get("access-control-allow-origin"), "https://client.example");
    assert.ok(allowed.headers.get("strict-transport-security"));
    assert.equal(allowed.headers.get("x-powered-by"), null);
    assert.ok(allowed.headers.get("content-security-policy"));

    const rejected = await fetch(`${baseUrl}/health`, { headers: { Origin: "https://untrusted.example" } });
    assert.equal(rejected.status, 200);
    assert.equal(rejected.headers.get("access-control-allow-origin"), null);
});

test("global API limiter returns 429 when its request budget is exhausted", async () => {
    let last: Response | undefined;
    for (let i = 0; i < 101; i++) {
        last = await fetch(`${baseUrl}/api/v1/security-audit-probe`);
        if (last.status === 429) break;
    }
    assert.equal(last?.status, 429);
    const body = await last!.json() as { error?: { code?: string } };
    assert.equal(body.error?.code, "RATE_LIMITED");
});

test("logger redaction removes secret-bearing values", async () => {
    let output = "";
    const destination = new Writable({ write(chunk, _encoding, callback) { output += chunk.toString(); callback(); } });
    const testLogger = pino({ redact: { paths: [...sensitiveLogRedactionPaths], censor: "[REDACTED]" } }, destination);
    testLogger.info({
        passphrase: "audit-passphrase-secret", accessToken: "audit-access-token-secret",
        req: {
            url: "/api/v1/shares/secret-share-code/open",
            originalUrl: "/api/v1/shares/secret-share-code/open",
            headers: { authorization: "Bearer audit-auth-secret", cookie: "audit-cookie-secret" },
            params: { shareCode: "secret-share-code" },
        },
    }, "redaction probe");
    await new Promise<void>((resolve) => setImmediate(resolve));
    for (const secret of ["audit-passphrase-secret", "audit-access-token-secret", "secret-share-code", "audit-auth-secret", "audit-cookie-secret"]) {
        assert.equal(output.includes(secret), false, `log leaked ${secret}`);
    }
    assert.ok(output.includes("[REDACTED]"));
});
