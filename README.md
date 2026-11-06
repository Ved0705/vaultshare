# VaultShare

**Temporary, secure file and secret sharing with controlled access and expiry.**

VaultShare is a backend application for sharing encrypted content and files with specific users. It supports per-vault permissions, passphrase-protected access, configurable expiration policies, access limits, and owner-reviewed write requests.

## Features

- **Encrypted vaults:** AES-256-GCM encryption with a per-vault Data Encryption Key (DEK).
- **Envelope encryption:** DEKs are protected using a Key Encryption Key (KEK).
- **Controlled sharing:** Share vaults with specific registered users.
- **Granular permissions:** READ and WRITE permissions are assigned per vault.
- **Passphrase protection:** Shared access uses Argon2id-hashed passphrases.
- **Access limits:** Configure the maximum number of successful opens.
- **Expiration policies:** Configure overall vault expiration and optional per-reader post-open expiration.
- **Lifecycle management:** Choose between destroying encrypted content and revoking access while retaining the root vault payload.
- **Lineage protection:** Source revocation and expiration destroy descendant vaults and invalidate shares across the lineage.
- **Individual share revocation:** Revoke one reader's access without destroying other readers' access or the vault lineage.
- **Write requests:** WRITE recipients can submit proposed changes for owner review.
- **Derived vaults:** Approved proposals create independent vaults with fresh encryption contexts.
- **Encrypted file sharing:** Store encrypted file blobs in private local storage.
- **Background cleanup:** Process deferred file and destroyed-vault cleanup jobs with retries.

## Technology Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Language | TypeScript |
| Backend | Express 5 |
| Database | PostgreSQL 17 |
| ORM and migrations | Drizzle ORM / Drizzle Kit |
| Authentication | AWS Cognito |
| Validation | Zod |
| Content encryption | AES-256-GCM |
| Passphrase hashing | Argon2id |
| File storage | Private local storage |
| Email integration | Nodemailer |
| Local email testing | Mailpit |
| Logging | Pino |
| Development | Docker Compose, tsx |

## Architecture

VaultShare uses a modular layered-monolith architecture.

The application separates API routes, controllers, business services, database access, infrastructure integrations, and shared middleware.

Major business areas include:

- Authentication and user provisioning
- Vault management and lifecycle processing
- Sharing and access control
- Access requests
- Write requests and derived vaults
- File management and storage
- Expiry scheduling and cleanup processing

PostgreSQL is the authoritative persistent data store. Background processes run independently of the HTTP server.

See [System Architecture](docs/ARCHITECTURE.md) for the architecture and lifecycle details.

## Local Development Setup

### Prerequisites

- Node.js and npm
- Git
- Docker Desktop
- AWS Cognito development User Pool and application client

### 1. Clone the repository

```powershell
git clone https://github.com/Ved0705/vaultshare.git
cd vaultshare
```

### 2. Install dependencies

```powershell
npm install
```

### 3. Configure environment variables

Create a local `.env` file using `.env.example` as a reference.

Configure the required Cognito values and generate a 32-byte Base64 encryption key:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Set the generated key as `VAULT_KEK_BASE64`.

Keep `.env` and encryption keys private. Do not commit real credentials.

### 4. Start local infrastructure

```powershell
docker compose up -d
```

Local services:

| Service | Address |
|---|---|
| PostgreSQL | `localhost:5433` |
| Mailpit SMTP | `localhost:1025` |
| Mailpit Web UI | `http://localhost:8025` |

### 5. Run database migrations

```powershell
npx drizzle-kit migrate
```

### 6. Start the API

```powershell
npm run dev
```

The API runs at `http://localhost:3000` by default.

Health check:

```text
GET http://localhost:3000/health
```

See [Setup & Operations](docs/SETUP.md) for complete configuration and troubleshooting instructions.

## Background Processes

Run each process in a separate terminal.

Start the vault expiry scheduler:

```powershell
npm run expiry:scheduler
```

Start the file and vault cleanup worker:

```powershell
npm run cleanup:worker
```

The expiry scheduler checks for expired vaults periodically. The cleanup worker processes pending storage cleanup jobs, retries failures, and marks jobs that exceed their configured retry limit as `FAILED`.

## API Overview

Base URL:

```text
http://localhost:3000/api/v1
```

| Method | Endpoint | Description |
|---|---|---|
| GET | `/auth/me` | Retrieve the authenticated user |
| POST | `/vaults` | Create a vault |
| GET | `/vaults` | List vaults |
| GET | `/vaults/:id` | Retrieve a vault |
| PATCH | `/vaults/:id` | Update a vault |
| POST | `/vaults/:id/revoke` | Revoke a vault |
| DELETE | `/vaults/:id` | Delete a vault |
| POST | `/vaults/:id/shares` | Create a share |
| PATCH | `/vaults/:id/shares/:shareId/revoke` | Revoke a specific share |
| PATCH | `/vaults/:id/shares/revoke-all` | Revoke all shares |
| POST | `/shares/:shareCode/open` | Open a shared vault |
| POST | `/shares/:shareCode/write-requests` | Submit a WRITE request |
| POST | `/access-requests/vaults/:vaultId` | Request vault access |
| PATCH | `/access-requests/:requestId/cancel` | Cancel an access request |

Additional endpoints support access-request reviews, WRITE request reviews, file operations, and shared-file access.

Authenticated endpoints require a valid Cognito access token and a provisioned VaultShare user.

See [API Reference](docs/API.md) for the documented endpoints and request behavior.

## Security

Implemented security controls include:

- AES-256-GCM encryption for vault content.
- Per-vault DEKs protected by a KEK.
- Argon2id passphrase hashing.
- Cognito access-token verification.
- Per-vault authorization.
- Failed passphrase-attempt tracking.
- Database transactions and row-level locking for sensitive lifecycle and access operations.
- Private storage for encrypted file blobs.
- Lineage-wide destruction and share invalidation on source revocation or expiration.
- Deferred cleanup with retries.

Security limitations and remaining work are documented in [Security](docs/SECURITY.md).

**Important:** The local Docker configuration is intended for development, not production deployment.

## Testing

Available checks:

```powershell
npm run typecheck
npm run build
npm run db:test
npm run authorization:test
npm run encryption:test
npm run storage:test
npm run lifecycle:test
npm run file-cleanup:test
npm run write-race:test
npm run share-isolation:test
```

Some integration tests require a configured local PostgreSQL database and environment variables.

## Project Status

VaultShare is under active development.

The repository contains backend implementations for its core encryption, authentication, sharing, vault lifecycle, file-storage, and write-request workflows.

Not all requirements are complete or production-ready. Features such as comprehensive audit logging, account deletion, folder management, notification workflows, renewal and access-count requests, general rate limiting, OpenAPI documentation, and production backup and recovery guarantees remain separate work items.

## Documentation

- [System Architecture](docs/ARCHITECTURE.md)
- [API Reference](docs/API.md)
- [Security](docs/SECURITY.md)
- [Setup & Operations](docs/SETUP.md)

## License

The `package.json` currently specifies the ISC license. Confirm the intended project license before publishing a release.