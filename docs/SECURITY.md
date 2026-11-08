# VaultShare — Security Architecture and Controls

## 1. Purpose and Scope

This document describes the security design and implemented controls in VaultShare.

VaultShare is a temporary secure file and secret-sharing application built as a modular layered monolith using Node.js, TypeScript, Express 5, and PostgreSQL.

The security model focuses on:
- Authenticated access and per-vault authorization.
- Encryption of vault content and uploaded files.
- Secure handling of share passphrases.
- Expiration, revocation, and permanent destruction.
- Isolation between readers and vaults.
- Safe handling of concurrent lifecycle and write operations.
- Deferred cleanup of encrypted storage.

This document distinguishes implemented controls from operational requirements that still need verification. It does not represent a production security certification.

## 2. Security Objectives

VaultShare aims to provide:

| Objective | Security expectation |
|---|---|
| Confidentiality | Vault content and stored file content remain encrypted. |
| Authorization | Users can access only resources permitted by authentication and vault-level permissions. |
| Integrity | Authenticated encryption detects unauthorized ciphertext modification. |
| Isolation | Revoking one reader's share does not revoke unrelated readers or destroy the source vault. |
| Expiration | Expired access cannot be used to continue accessing a vault. |
| Destruction | Destroyed vaults have their encrypted payload and key material cleared from the database. |
| Accountability | Lifecycle and access-related operations should be traceable without exposing secrets. |

## 3. Authentication and Authorization

### 3.1 Authentication

AWS Cognito is the identity provider.

The backend verifies Cognito access tokens before allowing access to protected routes. Authentication establishes the identity of the caller; it does not automatically grant access to every vault.

The application maintains its own user records in PostgreSQL.

### 3.2 Authorization

Authorization is evaluated separately from authentication.

Vault permissions are assigned per share:
- `READ`
- `WRITE`

Access decisions consider the applicable share, its status, permissions, passphrase verification, expiration, and access-count restrictions.

A user's permission on one vault must not be treated as permission on another vault.

### 3.3 Authorization boundaries

The backend must enforce authorization in business services, not rely solely on client-side checks.

Owner-only operations must verify ownership. Reader operations must verify the selected share and its permitted actions.

## 4. Encryption and Key Management

### 4.1 Envelope encryption

VaultShare uses server-managed envelope encryption.

- Each vault receives an independent Data Encryption Key (DEK).
- Vault content is encrypted using AES-256-GCM.
- The DEK is encrypted using a Key Encryption Key (KEK).
- Encrypted content, encrypted DEK, nonce, and authentication tag are persisted as encrypted vault data.
- The KEK is supplied through environment configuration and is not stored in vault database records.

### 4.2 Authenticated encryption

AES-256-GCM provides confidentiality and integrity verification.

Decryption must fail when the ciphertext or authentication data is invalid. Authentication tags must be verified before plaintext is accepted.

### 4.3 Key separation

A derived vault created after approval of a WRITE request receives a fresh encryption context and independent DEK. It must not reuse the source vault's DEK.

### 4.4 Key-management limitations

The KEK is outside the vault database, but environment-based configuration alone does not establish a complete production key-management system.

The following operational controls require separate verification before production:
- Secure KEK provisioning and access restrictions.
- KEK rotation and re-encryption procedures.
- Backup and recovery of key material.
- Emergency response to KEK compromise.
- Prevention of key exposure through logs, diagnostics, or deployment configuration.

## 5. Passphrase Security

Share passphrases are verified using Argon2id-based password hashing.

Passphrases must not be stored or logged as plaintext.

Passphrase verification is separate from Cognito authentication. A valid Cognito identity does not bypass the passphrase requirement for a protected share.

Failed verification attempts must not increment the successful-open access counter.

## 6. Share Isolation

Share permissions are scoped to individual vault shares.

Revoking an individual reader's share must:
- Revoke the selected share.
- Preserve other readers' active shares.
- Preserve the source vault's encrypted payload.
- Preserve derived vaults and their lineage.

The share-revocation isolation integration test verifies these behaviors.

## 7. Vault Lifecycle Security

Vault lifecycle operations enforce the distinction between revoking access and permanently destroying content.

### 7.1 REVOKE_ACCESS

When the source vault is revoked or expires under the `REVOKE_ACCESS` policy:
- The source vault retains its encrypted payload.
- Reader shares across the lineage are invalidated.
- Descendant vaults are permanently destroyed.
- Encrypted WRITE proposal payloads are cleared.
- Pending WRITE requests are rejected.
- Cleanup jobs are queued for destroyed descendants.

### 7.2 DESTROY

When a vault is destroyed:
- Its encrypted content and key material are cleared from the vault record.
- Descendant vaults across the lineage are also destroyed.
- Shares associated with the affected lineage are invalidated.
- Pending WRITE requests are rejected and proposal payloads cleared.
- Cleanup jobs are queued for destroyed vault resources.

### 7.3 Expiration precedence

Overall vault expiration takes priority over an individual reader's post-open expiration.

Once an individual reader's post-open access period expires, that share cannot be used again.

A destroyed vault must not be restored through ordinary application operations.

### 7.4 Lifecycle verification

The lifecycle integration tests cover:
- Source revocation with root payload retention.
- Destruction of descendant generations.
- Share invalidation across the lineage.
- WRITE proposal payload clearing.
- Rejection of pending WRITE requests.
- Cleanup-job creation.
- DESTROY expiry of the root and descendants.

## 8. Concurrency and Transaction Safety

Lifecycle operations and WRITE-request review operations can affect the same vault records.

The implementation uses a consistent vault-first lock order for the relevant operations:
1. Source vault.
2. WRITE request.
3. Share, where applicable.

The WRITE approval versus source-revocation race test exercises competing operations and verifies the resulting lifecycle behavior.

Database transactions and row-level locking are used to protect state transitions from conflicting operations.

These tests provide targeted concurrency verification; they do not establish the absence of every possible race condition.

## 9. File Storage and Cleanup

Encrypted file blobs are stored in private local storage outside the publicly served application directory.

Storage keys are generated by the application rather than derived directly from user-supplied filenames.

Cleanup is handled asynchronously through cleanup jobs.

The cleanup worker:
- Claims eligible jobs with database locking.
- Processes file-blob and vault cleanup tasks.
- Treats an already-missing blob as successfully removed.
- Retries eligible failures with backoff.
- Marks jobs as failed after the configured maximum attempts.

A permanently failed cleanup job requires operational investigation. Database payload clearing and physical blob deletion are separate operations; a queued cleanup job must not be interpreted as proof that every physical file has already been deleted.

## 10. Logging and Sensitive Data

Sensitive values must not appear in application logs or error responses.

This includes:
- Plaintext vault content.
- Share passphrases.
- Encryption keys and decrypted key material.
- Authentication tokens.
- Sensitive file contents.

Logs should contain operational metadata sufficient for debugging without recording secret values.

The Pino logger redacts authorization and cookie headers, request URLs and share-code parameters, and common secret-bearing fields. Centralized request-error logging records error names and request methods rather than raw exception objects. Background workers use sanitized error metadata. Runtime negative tests proving that secrets never appear in logs are still required before production deployment.

## 11. Application-Level Security

The Express application uses Helmet security headers, enables HSTS in production, and applies a configured CORS origin allowlist. The default development origin is http://localhost:5173; production deployments must set CORS_ORIGINS to the exact trusted browser origins.

A global API rate limiter is applied to /api/v1. Request payloads are validated using Zod at applicable route boundaries. File uploads use Multer and application-controlled storage paths.

These controls reduce common input and application exposure risks but do not replace:
- Per-identity and endpoint-specific abuse controls.
- Security monitoring and alerting.
- Automated negative tests for log and response leakage.
- Dependency vulnerability management.
- Production infrastructure hardening.

## 12. Threats and Mitigations

| Threat | Intended mitigation |
|---|---|
| Unauthorized API access | Cognito access-token verification |
| Unauthorized vault access | Per-vault authorization and share-state checks |
| Passphrase disclosure | Argon2id hashing and secret-safe handling |
| Database disclosure | Envelope encryption of vault content |
| Ciphertext modification | AES-256-GCM authentication |
| Cross-reader access | Individual share isolation |
| Expired-link reuse | Share and vault lifecycle checks |
| Source revocation bypass through derived copies | Descendant destruction across vault lineage |
| Concurrent approval and revocation | Consistent lock order and transactional state changes |
| Storage-path manipulation | Generated storage keys and private storage |
| Incomplete physical cleanup | Durable cleanup jobs, retries, and failure states |

## 13. Known Gaps and Production Readiness

The following areas must not be treated as complete merely because the core encryption and lifecycle tests pass:

- Per-identity and endpoint-specific rate limiting for sensitive operations, including upload/download and passphrase workflows.
- Security audit logging and audit-event retention.
- KEK rotation and operational key recovery.
- Production backup retention and deletion guarantees.
- Cleanup-job monitoring and failed-job recovery procedures.
- Production notification security and delivery controls.
- Automated security scanning and dependency monitoring.
- Runtime negative tests proving secrets are absent from logs and API responses.
- Production deployment hardening and incident-response procedures.

These areas remain part of the wider security and PRD compliance audit.

## 14. Security Testing

The following targeted tests have been reported passing during development:

| Test | Verified behavior |
|---|---|
| `authorization:test` | Authorization permission checks |
| `encryption:test` | Encryption/decryption behavior |
| `storage:test` | Encrypted storage behavior |
| `lifecycle:test` | Vault lifecycle and descendant destruction |
| `file-cleanup:test` | Cleanup worker behavior |
| `write-race:test` | WRITE approval versus source-revocation race |
| `share-isolation:test` | Individual reader-share revocation isolation |

These are development integration tests, not a substitute for a full penetration test or independent security review.

## 15. Account Deletion

Account deletion is implemented as a retryable lifecycle workflow.

- The authenticated user is identified through the verified Cognito subject and matched to the application user record.
- The account is moved from `ACTIVE` to `DELETION_PENDING` before destructive work begins, blocking further application access.
- Vault data is destroyed and encrypted file cleanup is queued.
- The Cognito identity is deleted through the Cognito administrative API.
- Relational records are finalized while retaining a `DELETED` tombstone.
- If Cognito deletion fails, the account remains pending so the deletion worker can retry.

The workflow is designed to be safely retried. Account deletion tests are available through:

```bash
npm run account-deletion:test
```

Account deletion should be tested with dedicated development identities. Do not use a real production identity for destructive verification.

## 16. Security Status

VaultShare has implemented core authentication, authorization, encryption, share isolation, lifecycle handling, and asynchronous cleanup mechanisms.

The project remains under development. Production readiness depends on completing the remaining security, operational, monitoring, backup, and deployment controls described above.
