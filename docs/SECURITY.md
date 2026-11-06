# VaultShare — System Architecture

## 1. Overview

VaultShare uses a modular layered-monolith architecture built with Node.js, TypeScript, Express 5, and PostgreSQL.

The application is organized into business modules, infrastructure services, middleware, authorization, and database access.

The architecture keeps business logic separate from infrastructure concerns while allowing the application to run as a single backend service.

## 2. Technology Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Language | TypeScript |
| HTTP framework | Express 5 |
| Database | PostgreSQL 17 |
| ORM | Drizzle ORM |
| Validation | Zod |
| Authentication | AWS Cognito |
| Encryption | AES-256-GCM |
| Key derivation / passphrase hashing | Argon2id |
| Logging | Pino |
| File uploads | Multer |
| Email | Nodemailer |
| Local infrastructure | Docker Compose |

## 3. High-Level Architecture

```text
                  Client
                    |
                    v
             Express Application
                    |
          Middleware and Routing
                    |
        +-----------+-----------+
        |           |           |
        v           v           v
    Vaults       Shares      Files
        |           |           |
        +-----------+-----------+
                    |
                    v
             Business Services
                    |
        +-----------+-----------+
        |           |           |
        v           v           v
   Authorization  Encryption  Validation
        |           |           |
        +-----------+-----------+
                    |
                    v
             Drizzle ORM
                    |
                    v
               PostgreSQL

       Background Processing
          |             |
          v             v
    Vault Expiry    File Cleanup
      Scheduler       Worker
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

- `authorization/`: Permission-related checks.
- `config/`: Environment configuration and logging.
- `db/`: PostgreSQL connection, schemas, migrations, and database utilities.
- `infrastructure/`: Cognito integration, encryption, email, storage, and jobs.
- `middleware/`: Authentication, user provisioning, error handling, and request handling.
- `modules/`: Business functionality grouped by domain.
- `app.ts`: Express application configuration and route registration.
- `server.ts`: HTTP server startup and graceful shutdown.

## 5. Request Processing Flow

A typical protected API request follows this sequence:

1. The client sends an HTTP request.
2. Express applies application middleware.
3. Authentication middleware verifies the Cognito access token.
4. Provisioning middleware checks the application user where required.
5. Route validation checks request input.
6. The relevant controller invokes business services.
7. Business services enforce authorization and business rules.
8. Drizzle ORM executes database operations.
9. The controller returns the HTTP response.

Errors are passed through centralized error-handling middleware.

## 6. Database Architecture

PostgreSQL is the authoritative persistent data store.

Drizzle ORM manages database access, with schema definitions under `src/db/schema/` and migrations under `src/db/migrations/`.

### Main entities

| Entity | Responsibility |
|---|---|
| Users | Application user records |
| Folders | Vault organization |
| Vaults | Encrypted content and lifecycle |
| Shares | Recipient permissions and access state |
| Share credentials | Hashed share passphrases |
| Passphrase attempts | Failed and successful verification records |
| Access requests | Requests to access vaults |
| Write requests | Proposed changes to shared vault content |
| Vault lineage | Relationships between source and derived vaults |
| Files | Encrypted file metadata |
| Cleanup jobs | Deferred storage cleanup |

## 7. Encryption Architecture

VaultShare uses envelope encryption.

- Each vault has its own Data Encryption Key (DEK).
- Vault content is encrypted using AES-256-GCM.
- The DEK is encrypted using a Key Encryption Key (KEK).
- Encrypted content and encrypted DEK are persisted in the database.
- Nonce and authentication tag information are stored for authenticated decryption.

The KEK is supplied through environment configuration and is not stored in the vault database records.

## 8. Authentication and Authorization

AWS Cognito handles identity authentication.

The backend verifies access tokens and retrieves user information through the Cognito integration.

Application-level permissions are evaluated separately from authentication.

Shares define recipient permissions per vault:

- `READ`
- `WRITE`

A user's ability to access a vault depends on authentication, provisioning, share status, permission checks, passphrase verification, and applicable expiration and access-count rules.

## 9. Vault Lifecycle and Expiration

Vault expiration is processed by a dedicated scheduler.

The scheduler periodically invokes expiration processing.

Two expiry policies are supported:

### DESTROY

- Marks the vault as destroyed.
- Clears encrypted content and key material from the vault record.
- Creates a cleanup job for associated resources.

### REVOKE_ACCESS

- Marks the vault as expired.
- Retains encrypted vault content.
- Revokes active reader access by expiring shares.

Overall vault expiration takes priority over individual reader post-open expiration.

## 10. File Storage and Cleanup

File metadata is stored in PostgreSQL.

Encrypted file blobs are stored in private local storage, outside the publicly served application directory.

Storage operations use generated storage keys rather than trusting user-provided filenames as storage paths.

A separate cleanup worker processes queued cleanup jobs.

## 11. Derived Vault Architecture

A WRITE recipient submits a proposed change through a write request.

The owner reviews the request.

On approval:

1. The proposal is decrypted.
2. A derived vault is created for the requesting user.
3. The derived vault receives a fresh encryption context and DEK.
4. The source and derived vault relationship is recorded in vault lineage.

The source vault is not directly overwritten by the approval process.

## 12. Background Processes

VaultShare uses separate background processes:

| Process | Responsibility |
|---|---|
| Expiry scheduler | Finds and processes expired vaults |
| Cleanup worker | Processes pending file and vault cleanup jobs |

These processes are started independently of the HTTP server.

## 13. Local Infrastructure

Docker Compose provides local development services:

| Service | Purpose |
|---|---|
| PostgreSQL | Persistent application database |
| Mailpit | Local SMTP testing and email inspection |

The application server runs separately using the Node.js development command.

## 14. Architectural Principles

- Modular layered monolith instead of premature microservices.
- PostgreSQL as the authoritative persistent data store.
- Separate authentication and application authorization.
- Per-vault encryption keys.
- Explicit vault and share lifecycle management.
- Background processing for expiration and cleanup.
- Private storage for encrypted file blobs.
- Environment-based configuration.

## 15. Current Scope

This document describes the implemented backend architecture. It does not imply that every listed module represents a complete production-ready feature or that a production deployment is available.