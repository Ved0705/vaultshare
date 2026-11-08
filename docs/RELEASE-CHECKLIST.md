# VaultShare V1 — Release Readiness Checklist

This checklist is a gate, not a declaration that the service is production-ready. The V1 requirement of ₹0 personal out-of-pocket cost is mandatory. Do not provision paid infrastructure, enable billable AWS services, register paid domains, or add paid third-party services without explicit approval.

## 1. Repository and build

- [ ] Work from the intended release commit and a clean working tree.
- [ ] Install with the lockfile using npm ci.
- [ ] Apply all Drizzle migrations to an isolated release-test database.
- [ ] Run npm run typecheck and npm run build.
- [ ] Run every database-backed integration test with disposable test identities/data.
- [ ] Review dependency audit and security advisories.
- [ ] Confirm .env, real Cognito credentials, KEKs, tokens, SMTP credentials, and private-storage blobs are not committed.

## 2. Product acceptance

- [ ] Verify owner and reader workflows from the API and the actual client.
- [ ] Verify folder CRUD and cross-user isolation.
- [ ] Verify custom and generated passphrases; generated passphrases must be copied securely and are not retrievable later.
- [ ] Verify first-share overall TTL, first-successful-open post-open TTL, access-count behavior, and overall-TTL precedence.
- [ ] Verify owner-controlled extension and exhausted-count reactivation.
- [ ] Resolve and implement the separately approved reader-submitted renewal/additional-access request workflow.
- [ ] Verify WRITE approval/rejection and multi-generation derived-copy destruction.
- [ ] Verify account deletion with dedicated development Cognito identities.
- [ ] Define and enforce aggregate storage quotas before public use.
- [ ] Build and test the in-app/web notification experience if it remains a V1 requirement.

## 3. Security and privacy

- [ ] Keep Cognito access-token verification and PostgreSQL authorization authoritative.
- [ ] Store KEKs outside the database and verify backup/recovery access to historical key versions.
- [ ] Verify production CORS origins are explicit HTTPS origins and TRUST_PROXY_HOPS matches the actual topology.
- [ ] Use a shared rate-limit store before running multiple API instances.
- [ ] Verify audit and application logs contain no secrets, request bodies, raw share codes, or plaintext content.
- [ ] Verify email content remains metadata-only.
- [ ] Review upload size, aggregate quota, storage path, file permissions, and memory limits.
- [ ] Complete independent security review / penetration testing and dependency scanning.

## 4. Operations and recovery

- [ ] Configure and supervise the API, expiry scheduler, cleanup worker, and notification worker as separate processes.
- [ ] Configure SMTP provider, sender authentication, bounce handling, retry monitoring, and delivery alerts.
- [ ] Configure monitoring, alert routing, incident ownership, and operational runbooks.
- [ ] Select RPO/RTO and backup retention/deletion policy.
- [ ] Run and record a complete isolated restore drill using PostgreSQL dump, private encrypted blobs, matching KEK versions, and matching application/migration version.
- [ ] Verify cleanup jobs in FAILED state alert operators and have a recovery procedure.
- [ ] Verify account/vault deletion disclosures explain that retained backups may contain historical encrypted data until retention expires.

## 5. Cost and deployment

- [ ] Confirm every infrastructure component and usage limit against current pricing before deployment.
- [ ] Confirm the chosen V1 deployment path costs ₹0 personally; otherwise do not deploy until the user explicitly approves a different budget.
- [ ] Do not assume AWS free-tier eligibility, credits, or non-billable usage.
- [ ] Keep development Docker credentials and local ports out of production.
- [ ] Do not describe the service as production-ready until all applicable gates above are completed and evidenced.

## Current known blockers

- Reader-submitted renewal/additional-access request workflow is not implemented; its post-open expiry semantics must be reconciled with the permanent-expiry rule.
- In-app/web notification inbox is not implemented; current notifications are email-only.
- Aggregate storage quotas are not implemented.
- Live Cognito account deletion has not been exercised by CI.
- Production SMTP delivery is not verified by Mailpit tests.
- Backup restore, retention and deletion propagation are documented but not operationally validated.
- Production KMS/HSM, distributed rate limiting, monitoring, incident response, and frontend acceptance remain outstanding.
