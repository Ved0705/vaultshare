# VaultShare — System Architecture

## 1. Overview

VaultShare uses a modular layered-monolith architecture built with Node.js, TypeScript, Express 5, and PostgreSQL.

The application is organized into business modules, infrastructure services, middleware, authorization, and database access. Business logic is separated from infrastructure concerns while the backend runs as a single application.

Three background processes handle vault expiration, deferred storage cleanup, and transactional email delivery independently of the HTTP server.

## 2. Technology Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Language | TypeScript |
| HTTP framework | Express 5 |
| Database | PostgreSQL 17 |
| ORM and migrations | Drizzle ORM / Drizzle Kit |
| Validation | Zod |
| Authentication | AWS Cognito |
| Content encryption | AES-256-GCM |
| Passphrase hashing | Argon2id |
| Logging | Pino |
| File uploads | Multer |
| Email integration | Nodemailer |
| Local infrastructure | Docker Compose |
| Local email testing | Mailpit |

## 3. High-Level Architecture

```text
                         Client
                           |
                           v
                  Express Application
                           |
                  Middleware and Routing
                           |
          +----------------+----------------+
          |                |                |
          v                v                v
        Vaults           Shares           Files
          |                |                |
          +----------------+----------------+
                           |
                           v
                    Business Services
                           |
          +----------------+----------------+
          |                |                |
          v                v                v
     Authorization     Encryption       Validation
          |                |                |
          +----------------+----------------+
                           |
                           v
                       Drizzle ORM
                           |
                           v
                      PostgreSQL

                    Background Processes
                           |
              +------------+------------+
              |                         |                         |
              v                         v                         v
        Vault Expiry              Cleanup Worker            Notification Worker
         Scheduler               File and Vault Jobs        Email Outbox
```

## 4. Source Code Organization

```text
src/
├── authorization/
├── config/
├── db/
│   ├── migrations/
│   └── schema/
├── infrastructure/
│   ├── cognito/
│   ├── email/
│   ├── encryption/
│   ├── jobs/
│   └── storage/
├── middleware/
├── modules/
│   ├── access-requests/
│   ├── audit/
│   ├── derived-copies/
│   ├── files/
│   ├── folders/
│   ├── notifications/
│   ├── shares/
│   ├── users/
│   └── vaults/
├── app.ts
└── server.ts
```

### Responsibilities

- `authorization/`: Permission checks and access-control rules.
- `config/`: Environment configuration and logging setup.
- `db/`: PostgreSQL connection, schemas, migrations, and database utilities.
- `infrastructure/`: Cognito integration, encryption, email, storage, and background-job infrastructure.
- `middleware/`: Authentication, user provisioning, error handling, and request processing.
- `modules/`: Business functionality grouped by domain.
- `app.ts`: Express application configuration and route registration.
- `server.ts`: HTTP server startup and shutdown.

The presence of a module directory does not necessarily mean that every planned feature in that domain is complete.

## 5. Request Processing Flow

A typical protected API request follows this sequence:

1. The client sends an HTTP request.
2. Express applies application middleware.
3. Authentication middleware verifies the Cognito access token.
4. User-provisioning middleware resolves the application user where required.
5. Route validation checks request input.
6. The controller invokes the relevant business service.
7. Business services enforce authorization and business rules.
8. Drizzle ORM performs database operations.
9. The controller returns the HTTP response.

Errors are passed to centralized error-handling middleware.

## 6. Database Architecture

PostgreSQL is the authoritative persistent data store.

Drizzle ORM manages database access. Schema definitions are maintained under `src/db/schema/`, and migrations are maintained under `src/db/migrations/`.

### Main entities

| Entity | Responsibility |
|---|---|
| Users | Application user records |
| Folders | Vault organization |
| Vaults | Encrypted content and lifecycle state |
| Shares | Recipient permissions and access state |
| Share credentials | Hashed share passphrases |
| Passphrase attempts | Passphrase verification attempt records |
| Access requests | Requests for vault access |
| Write requests | Proposed changes submitted by WRITE recipients |
| Vault lineage | Relationships between source and derived vaults |
| Files | Encrypted file metadata |
| Cleanup jobs | Deferred file and vault storage cleanup |

Database transactions and row-level locking are used for sensitive operations that require consistent state transitions.

## 7. Encryption Architecture

VaultShare uses server-managed envelope encryption.

- Each vault has its own Data Encryption Key (DEK).
- Vault content is encrypted using AES-256-GCM.
- The DEK is encrypted using a Key Encryption Key (KEK).
- Encrypted content, encrypted DEK, nonce, and authentication tag information are persisted as required for authenticated decryption.
- The KEK is supplied through environment configuration and is not stored in vault database records.

Derived vaults receive a fresh encryption context and DEK rather than reusing the source vault's DEK.

Passphrases are hashed using Argon2id. They are not stored as plaintext.

## 8. Authentication and Authorization

AWS Cognito handles identity authentication.

The backend verifies Cognito access tokens and resolves the corresponding application user.

Authentication and application-level authorization are separate responsibilities.

Shares define recipient permissions per vault:

- `READ`
- `WRITE`

Access depends on authentication, user provisioning, share status, permission checks, passphrase verification, and applicable expiration and access-count rules.

Permissions are evaluated at the vault level rather than through permanent global Reader or Writer roles.

## 9. Vault Lifecycle and Lineage

Vaults can have derived generations created through approved WRITE requests.

The source-to-derived relationship is recorded in vault lineage.

### Expiration policies

Two expiry policies are supported:

**DESTROY**

- The root vault and its descendants are permanently marked as destroyed.
- Encrypted payload and key material are cleared from the affected vault records.
- Cleanup jobs are queued for associated stored resources.

**REVOKE_ACCESS**

- The root vault is marked as revoked.
- The root vault's encrypted payload is retained.
- Descendant vaults are destroyed and their encrypted payloads are cleared.
- Active and pending shares across the lineage are expired.

### Lineage-wide lifecycle processing

Source revocation and expiration use a shared lifecycle service.

The service:

1. Locks the root vault.
2. Discovers and locks descendant vaults.
3. Applies the required lifecycle state to the root.
4. Destroys descendant vault payloads and key material.
5. Expires active and pending shares across the lineage.
6. Clears encrypted WRITE proposal payloads.
7. Rejects pending WRITE requests.
8. Queues cleanup jobs for vaults whose payloads are destroyed.

The root payload is retained only when the applicable policy requires it, such as `REVOKE_ACCESS`.

### Individual share revocation

Revoking one reader's share is separate from revoking the source vault.

Individual share revocation does not destroy the source vault or its derived lineage. Other readers' valid shares remain unaffected.

### Expiration precedence

Overall vault expiration takes priority over an individual reader's post-open expiration.

## 10. File Storage and Cleanup

File metadata is stored in PostgreSQL.

Encrypted file blobs are stored in private local storage outside the publicly served application directory.

Storage operations use generated storage keys rather than trusting user-provided filenames as storage paths.

### Cleanup job processing

The cleanup worker processes queued file and vault cleanup jobs independently of the API server.

Its processing behavior includes:

- Claiming pending jobs using database locking and `FOR UPDATE SKIP LOCKED`.
- Recovering stale jobs left in the `PROCESSING` state.
- Processing file-blob and destroyed-vault cleanup jobs.
- Treating an already-missing file as successfully cleaned up.
- Retrying failed jobs with exponential backoff, capped at one hour.
- Marking jobs as `FAILED` after the configured maximum number of attempts.

A permanently failed cleanup job requires operational investigation; queuing a job does not itself prove that physical storage deletion has completed.

## 11. WRITE Requests and Derived Vaults

A recipient with WRITE permission can submit a proposed change through a write request.

The owner reviews the request.

On approval:

1. The proposal is decrypted.
2. A separate derived vault is created for the requesting user.
3. The derived vault receives a fresh encryption context and DEK.
4. The source and derived vault relationship is recorded in vault lineage.

The source vault is not directly overwritten by the approval process.

When a source vault is revoked or expires, pending WRITE requests across its lineage are rejected and encrypted proposal payloads are cleared.

## 12. Background Processes

VaultShare uses two independently started background processes.

| Process | Responsibility |
|---|---|
| Expiry scheduler | Finds and processes expired vaults |
| Cleanup worker | Processes pending file and destroyed-vault cleanup jobs |
| Notification worker | Delivers metadata-only emails from the transactional notification outbox |

The expiry scheduler invokes vault lifecycle processing. The cleanup worker handles deferred physical storage deletion.

All three processes run separately from the HTTP server. Start the notification worker with `npm run notifications:worker`; it is not automatically started by the API.

## 13. Local Infrastructure

Docker Compose provides local development services.

| Service | Purpose |
|---|---|
| PostgreSQL | Persistent application database |
| Mailpit | Local SMTP testing and email inspection |

The application server and background processes run separately using the Node.js development commands.

## 14. Architectural Principles

- Modular layered monolith instead of premature microservices.
- PostgreSQL as the authoritative persistent data store.
- Separate authentication and application authorization.
- Per-vault envelope encryption.
- Fresh encryption keys for derived vaults.
- Explicit vault, share, and lineage lifecycle management.
- Transactional handling and row-level locking for sensitive state transitions.
- Background processing for expiration, physical cleanup, and notification delivery.
- Private storage for encrypted file blobs.
- Environment-based configuration.

## 15. Current Scope and Limitations

This document describes the current backend architecture and implemented lifecycle behavior.

It does not imply that every planned module is complete or that the application is production-ready.

Account deletion, owner-scoped folder deletion, general rate limiting, owner-controlled share renewal, and additional-access-count extensions have implementation paths. Reader-submitted renewal/access-count request and owner-approval workflows are not implemented. Folder creation/listing workflows and comprehensive audit logging also remain separate product work.

Physical cleanup jobs can reach a terminal `FAILED` state and require operational handling.

Production deployment, managed secrets, HTTPS, monitoring, backup policy, and recovery procedures are not established by the local development architecture alone.

### Folder and audit modules

Folder endpoints support owner-scoped creation, listing, renaming, and deletion. Folder deletion detaches contained vaults without deleting their payloads. Request audit middleware records normalized API route, method, actor, resource identifier where available, and HTTP status without storing query strings or request bodies. Authenticated users can retrieve their own paginated activity history. Audit persistence is asynchronous and must not be treated as a tamper-proof compliance ledger.

### Notification outbox

Sharing, revocation, access-request, and WRITE-request events enqueue metadata-only notification records transactionally with their business changes. The separate notification worker sends only to active users with verified email addresses. Local SMTP integration is tested with Mailpit; production SMTP delivery, deliverability, and monitoring remain deployment concerns.
