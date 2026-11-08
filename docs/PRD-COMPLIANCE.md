# VaultShare V1 — PRD Compliance Audit

**Audit basis:** approved VaultShare V1 requirements and decisions recorded in the project, compared with the repository implementation on the Phase 13 completion branch.

**Status meanings**
- **Implemented:** corresponding backend behavior exists in the repository.
- **Implemented + regression coverage:** implementation and a repository integration/regression test exist. The current branch's CI result must still be checked before merge.
- **Partial / operational gate:** code exists, but production operation, external integration, or acceptance evidence is incomplete.
- **Gap / decision required:** approved behavior is not implemented, or the PRD does not define enough policy to implement it safely.

This is an engineering compliance audit, not a security certification or a claim of production readiness.

## 1. Approved architecture and non-negotiable constraints

| Requirement / decision | Repository evidence | Status |
|---|---|---|
| Modular layered monolith; no V1 microservices | Express application, domain modules, services, infrastructure and middleware | Implemented |
| Cognito access tokens authenticate callers; PostgreSQL is authoritative for application users and permissions | Cognito JWT verification, provisioned-user middleware, PostgreSQL user/share records | Implemented |
| READ and WRITE are per-vault share permissions; no permanent global Reader/Writer roles | Share permission arrays and service-level authorization | Implemented |
| V1 personal out-of-pocket cost must remain ₹0; no paid service without explicit approval | Local Docker PostgreSQL and Mailpit; cloud deployment is not required for local development | Hard constraint; deployment not approved |
| Secrets, vault content, passphrases and key material must not appear in logs or notification content | Logger redaction, normalized audit paths, metadata-only notification templates | Implemented controls; retain negative-test coverage |

## 2. Identity, account and session requirements

| Approved requirement | Implementation / evidence | Status |
|---|---|---|
| Cognito access-token authentication | Authentication middleware and protected API routes | Implemented |
| Application user provisioning and PostgreSQL authority | Provisioned-user middleware and users schema | Implemented |
| Logout/session termination | POST /api/v1/auth/logout stores token JTI in revocation table; authentication checks revocation | Implemented |
| User-initiated account deletion | DELETE /api/v1/users/me; retryable account-deletion workflow and worker | Implemented + database integration test |
| Account deletion destroys owned vault data, invalidates shares/copies and queues file cleanup | Account-deletion lifecycle and cascade integration tests | Implemented + regression coverage |
| Cognito identity is deleted as part of account deletion | Administrative Cognito call with retry path | Partial: CI does not call a live Cognito User Pool |
| Deleted-account tombstone and retry-safe finalization | Account-deletion service and integration test | Implemented + database integration test |

## 3. Folders and vault organization

| Approved requirement | Implementation / evidence | Status |
|---|---|---|
| Create folders | POST /api/v1/folders (added in this branch) | Implemented; CI pending |
| List only the caller's folders | GET /api/v1/folders (added in this branch) | Implemented; CI pending |
| Rename a folder | PATCH /api/v1/folders/:id (added in this branch) | Implemented; CI pending |
| Delete a folder without deleting its vaults | DELETE /api/v1/folders/:id; vaults detach to root | Implemented + integration coverage |
| Prevent cross-user folder access/mutation | Owner-scoped service predicates and 404 behavior | Implemented + integration coverage |

## 4. Vault creation, editing and encryption

| Approved requirement | Implementation / evidence | Status |
|---|---|---|
| AES-256-GCM vault content encryption | Encryption infrastructure and vault services | Implemented |
| Per-vault DEK protected by a KEK (envelope encryption) | Encryption service and versioned KEK columns | Implemented |
| KEK remains outside database | Environment-based KEK configuration | Implemented for local/dev; production KMS/HSM remains an operational gate |
| Argon2id share passphrase verification | Share credential service | Implemented |
| Vault metadata/content editable only before first successful reader open | Vault update and file upload lifecycle checks | Implemented; preserve regression coverage |
| Overall TTL starts when first shared, not at creation | First-share transaction in share creation | Implemented |
| New shares cannot bypass overall expiry | Share creation checks vault status and overall expiry | Implemented |
| Derived vaults receive fresh DEK and encryption context | WRITE approval creates a new vault/encryption context | Implemented |

## 5. Sharing, passphrases and access policy

| Approved requirement | Implementation / evidence | Status |
|---|---|---|
| Share with registered users using per-vault READ/WRITE permissions | Share creation and authorization services | Implemented |
| Custom passphrases | Share creation accepts 12–128 characters and stores only an Argon2id verifier | Implemented |
| Generate a strong passphrase for the owner | POST /api/v1/vaults/:id/shares/passphrase returns a fresh 32-character Base64URL passphrase (192 bits entropy); it is not persisted | Implemented in this branch; CI pending |
| Reader must authenticate and provide share passphrase | Share-open and shared-file validation | Implemented |
| Overall TTL takes precedence over per-reader post-open TTL | Lifecycle and share-access checks | Implemented + lifecycle tests |
| Per-reader post-open TTL begins on first successful open | First-open timestamp and expiry fields | Implemented |
| Once a reader's post-open TTL expires, that reader cannot regain access to the same vault | Replacement-share prevention | Implemented |
| Only successful opens consume access count; failed passphrases do not | Share-open transaction and attempt tracking | Implemented + share-access tests |
| Owner can extend exhausted access count while reader post-open window remains valid | PATCH /api/v1/vaults/:id/shares/:shareId/extend | Implemented |
| Owner can extend post-open TTL, capped by overall TTL | Share extension service | Implemented |
| Reader can submit renewal/additional-access request for owner approval | No request table, route, or review workflow found | Gap; post-open-expiry semantics must be reconciled with the locked permanent-expiry rule before implementation |
| Revoke one reader without affecting others | Individual share revocation | Implemented + isolation test |
| Revoke all shares | Revoke-all endpoint | Implemented |

## 6. Access requests, WRITE requests and derived-copy lineage

| Approved requirement | Implementation / evidence | Status |
|---|---|---|
| Reader can request access; owner can approve/reject | Access-request routes and services | Implemented |
| Reader can cancel pending access request | Cancellation endpoint | Implemented |
| WRITE recipient can submit proposed change | Share write-request endpoint | Implemented |
| Owner can approve or reject WRITE request | Owner review endpoint | Implemented |
| Rejected WRITE proposal cannot later be approved | Request state-transition checks | Implemented; retain regression coverage |
| Approval creates independent derived vault rather than overwriting source | WRITE approval service | Implemented |
| Copies of derived copies are supported with lineage | Parent/child lineage model | Implemented |
| Source revocation/expiry destroys all descendants and invalidates lineage shares | Shared lifecycle service | Implemented + multi-generation and race tests |
| DESTROY destroys root and descendants | Lifecycle service | Implemented |
| REVOKE_ACCESS retains source payload but destroys descendants | Lifecycle service | Implemented + lifecycle tests |
| Pending WRITE proposal payloads are cleared when source lifecycle ends | Lifecycle service | Implemented + lifecycle tests |

## 7. Files, storage, quotas and abuse controls

| Approved requirement | Implementation / evidence | Status |
|---|---|---|
| Encrypted file storage outside public web root | Private local storage and per-file encryption | Implemented |
| Support arbitrary file types | Upload filter validates filename and does not restrict MIME type | Implemented |
| Configurable maximum file size | MAX_FILE_SIZE_BYTES, default 10 MiB and hard maximum 100 MiB (added in this branch) | Implemented in this branch; CI pending |
| One file per upload request | Multer single-file upload | Implemented |
| Per-user or per-vault aggregate storage quota | No aggregate quota schema or enforcement found | Gap / product policy required |
| Global API rate limit | 100 requests per 15 minutes at /api/v1 | Implemented |
| Additional passphrase-attempt rate limit | 5 per 15 minutes by identity and IP, plus database-backed attempt tracking | Implemented |
| Additional file-operation rate limit | 30 per 15 minutes by identity and IP | Implemented |
| Distributed rate-limit store for multiple API replicas | Current express-rate-limit default memory store is process-local | Partial / production scaling gate |

A storage quota needs an approved definition (per account, per vault, treatment of derived copies, whether deleted-but-not-yet-cleaned blobs count, and maximum total bytes). No quota values are invented in this audit.

## 8. Notifications and audit history

| Approved requirement | Implementation / evidence | Status |
|---|---|---|
| Notify reader when a share is created | Transactional outbox event SHARE_CREATED | Implemented |
| Notify reader when a share is revoked | SHARE_REVOKED | Implemented |
| Notify owner when an access request is created | ACCESS_REQUEST_CREATED | Implemented |
| Notify requester when access request is reviewed | ACCESS_REQUEST_REVIEWED | Implemented |
| Notify owner when a WRITE request is created | WRITE_REQUEST_CREATED | Implemented |
| Notify requester when a WRITE request is reviewed | WRITE_REQUEST_REVIEWED | Implemented |
| Do not include sensitive content in emails | Generic metadata-only templates; no vault content/name, filename, share code, passphrase or request message/response | Implemented |
| Transactional notification enqueue and retry | Outbox write shares business transaction; worker retries up to five attempts and uses SKIP LOCKED | Implemented + Mailpit integration coverage |
| Notification delivery runs separately from API | npm run notifications:worker | Implemented; operator must start it |
| In-app/web notification inbox | No user-notification persistence, list, or read-state endpoint found; current outbox is email delivery only | Gap; UI delivery model requires frontend work |
| Audit successful and denied API requests | Middleware records actor, sanitized route, method, resource UUID where available and status | Implemented |
| User can view own audit history | GET /api/v1/audit-events with bounded pagination (added in this branch) | Implemented in this branch; CI pending |
| Tamper-proof ledger / guaranteed synchronous audit writes | Audit persistence is asynchronous after response completion | Not guaranteed; do not claim tamper-proof or gap-free evidence |

## 9. Deletion, backups and recovery

| Approved requirement | Implementation / evidence | Status |
|---|---|---|
| Database records and encrypted blobs handled separately during deletion | Cleanup jobs and private storage worker | Implemented |
| Cleanup is retryable and terminal failures observable | Cleanup worker, retry states and cleanup status command | Implemented |
| Manual backup includes PostgreSQL and private encrypted blobs | docs/BACKUP-RECOVERY.md | Documented |
| Restore into isolated environment and verify decryptability | Restore drill procedure documented | Procedure only; no restore drill result recorded |
| Backup retention and deletion propagation are defined and tested | No production retention policy or automatic backup service configured | Partial / operational policy required |
| Account/vault deletion erases old backup copies immediately | Not supported; historical backups may retain prior encrypted data until retention expires | Not guaranteed; disclose in retention policy |

## 10. Documentation and release readiness

| Requirement | Evidence | Status |
|---|---|---|
| Architecture reflects current modules and workers | docs/ARCHITECTURE.md updated | Implemented in this branch |
| API reference covers registered routes and validation | docs/API.md updated | Implemented in this branch |
| Machine-readable OpenAPI contract | docs/openapi.yaml | Implemented in this branch |
| Local setup and worker commands | docs/SETUP.md and .env.example | Implemented in this branch |
| Security model and known limitations | docs/SECURITY.md | Implemented in this branch |
| Backup and recovery procedure | docs/BACKUP-RECOVERY.md | Documented; operational drill outstanding |
| Release and PRD status | This matrix and README | Implemented in this branch |

## 11. Remaining acceptance gates

These items cannot honestly be marked complete from repository code alone:

1. **Reader renewal/additional-access requests:** reconcile the approved request workflow with the locked rule that post-open expiry permanently ends access; the repository currently implements owner-direct extension only.
2. **In-app/web notifications:** email outbox is implemented, but a persistent in-app inbox and frontend notification surface are not.
3. **Aggregate storage quotas:** approve per-account/per-vault limits and enforcement semantics.
4. **Production KEK custody:** select a no-cost V1-compatible arrangement or explicitly defer production deployment; do not introduce paid KMS without approval.
5. **Production email provider:** validate sender domain, deliverability, bounce handling and alerting. Mailpit is local test infrastructure only.
6. **Backup/restore drill:** perform a real isolated restore and record the result; choose retention and deletion propagation rules.
7. **Distributed rate limiting:** required before horizontal API scaling; current in-memory counters are per process.
8. **Monitoring and incident response:** configure operational alerting and response ownership.
9. **External security review:** run independent penetration testing and dependency/security scanning before public production.
10. **Frontend acceptance:** this repository is a backend API; browser UX cannot be accepted without the client application.
11. **Cognito live integration:** run destructive account deletion against dedicated development identities, not production accounts.
12. **Zero-cost validation:** verify current AWS and third-party pricing/limits before deployment. No paid infrastructure is approved by this audit.

## 12. Audit conclusion

The backend now covers the main approved V1 workflows: encrypted vaults/files, Cognito-backed identity, per-vault sharing, access and WRITE requests, owner-controlled share extension/count renewal, derived-copy lineage, lifecycle destruction, account deletion, folder CRUD, metadata-only email notifications, audit capture/history, and configurable single-file upload size. Reader-submitted renewal requests and in-app notifications remain gaps.

The Phase 13 branch adds the missing folder CRUD endpoints, generated passphrases, personal audit-history endpoint, configurable upload limit, OpenAPI contract, and updated compliance/release documentation. These changes remain subject to the branch's CI result and PR review.

VaultShare is **not yet production-ready**. Reader-submitted renewal requests, in-app notifications, aggregate quotas, real provider integrations, tested backup recovery, production key custody, monitoring, distributed rate limiting, frontend acceptance, and zero-cost deployment validation remain release gates.
