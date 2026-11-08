# Security operations

## Access tokens and logout

Only Cognito access tokens are accepted. JWT verification validates signature, issuer, token use, client and expiry. Refresh tokens are never accepted. Cognito controls token lifetime. POST /api/v1/auth/logout locally revokes the presented token by jti; this does not revoke Cognito refresh-token families or replace Cognito sign-out/revocation. Clients must also use Cognito's supported sign-out flow.

## File quotas

V1 per-vault quota: 100 active files and 100 MiB aggregate plaintext size. Single-file upload remains capped at 10 MiB.

## Cleanup operations

Supervise npm run cleanup:worker. Monitor PENDING, PROCESSING, COMPLETED and FAILED counts. Alert on FAILED jobs and oldest pending age above 15 minutes. FAILED means physical deletion is unconfirmed. Inspect resource ID/type, attempts and safe error code; repair storage/permission problems; requeue only after review; then verify COMPLETED and blob absence.

## Rate limits

Global and endpoint limiters currently use process-local memory. This is single-instance only. Multi-instance deployment requires a shared store. Authenticated file operations are limited to 30/15 minutes; share-open to 5/15 minutes. Shared-file listing/download and write-request creation are also limited.

## Audit events

Authenticated API requests are recorded with actor, method, route, resource ID where present, status and timestamp. Bodies, query strings, tokens, passphrases, filenames and file contents are excluded. Audit writes occur after response completion and are asynchronous; DB failure can cause a gap. This is operational audit history, not a tamper-proof compliance ledger.

## IDOR and error leakage

Test two Cognito identities and assert owner A cannot read/update/delete/revoke/download owner B resources and reader A cannot access reader B shares. Error responses must never expose stack traces, SQL, filesystem paths, storage keys, tokens or secrets.
