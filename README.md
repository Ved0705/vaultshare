# VaultShare

**Temporary, secure file and secret sharing with controlled access and expiry.**

VaultShare is a backend application for sharing encrypted content and files with specific users. It supports per-vault permissions, passphrase-protected access, configurable expiry policies, access limits, and owner-reviewed write requests.

## Features

- **Encrypted vaults:** Vault content is encrypted using AES-256-GCM with a per-vault data encryption key.
- **Controlled sharing:** Share vaults with specific registered users.
- **Granular permissions:** READ and WRITE permissions are assigned per share.
- **Passphrase protection:** Shared access is protected using Argon2id-hashed passphrases.
- **Access limits:** Configure the maximum number of successful opens.
- **Expiry policies:** Configure overall vault expiry and optional per-reader post-open expiry.
- **Expiry handling:** Choose between destroying encrypted vault content or revoking reader access while retaining the encrypted content.
- **Write requests:** Readers with WRITE permission can submit proposed changes for owner review.
- **Derived vaults:** Approved proposals create a separate vault with a new encryption context.
- **File sharing:** Upload, store and share encrypted files.
- **Background cleanup:** Process expired vaults and pending file cleanup jobs.

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
| Encryption | AES-256-GCM |
| Passphrase hashing | Argon2id |
| File storage | Local private storage |
| Email | Nodemailer |
| Local email testing | Mailpit |
| Logging | Pino |
| Development | Docker Compose, tsx |

## Architecture

VaultShare uses a modular layered monolith.

The application separates API routes, controllers, services, repositories, infrastructure integrations, database schemas and shared middleware.

Major modules include:

- Authentication and user provisioning
- Vault management
- Sharing and access control
- Access requests
- Write requests and derived copies
- File management
- Notifications
- Expiry and cleanup processing

## Prerequisites

Install the following before starting:

- Node.js and npm
- Docker Desktop
- Git
- AWS Cognito User Pool configuration

## Local Development Setup

### 1. Clone the repository

```bash
git clone https://github.com/Ved0705/vaultshare.git
cd vaultshare
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a local `.env` file using `.env.example` as the template.

Required configuration:

```env
NODE_ENV=development
PORT=3000

DATABASE_URL=postgresql://vaultshare:local_dev_password@localhost:5433/vaultshare

STORAGE_PATH=./private-storage

MAIL_HOST=localhost
MAIL_PORT=1025
MAIL_FROM=VaultShare <no-reply@vaultshare.local>

COGNITO_USERINFO_URL=
COGNITO_REGION=
COGNITO_USER_POOL_ID=
COGNITO_CLIENT_ID=

VAULT_KEK_BASE64=
```

Generate a 32-byte encryption key encoded in Base64:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Set the generated value as `VAULT_KEK_BASE64`.

Configure the Cognito values using your own User Pool and application client. Do not commit `.env` or share encryption keys.

### 4. Start local infrastructure

```bash
docker compose up -d
```

This starts:

| Service | Local address |
|---|---|
| PostgreSQL | `localhost:5433` |
| Mailpit SMTP | `localhost:1025` |
| Mailpit Web UI | `http://localhost:8025` |

### 5. Run database migrations

```bash
npx drizzle-kit migrate
```

The migration files are maintained under:

```text
src/db/migrations/
```

### 6. Start the API

```bash
npm run dev
```

The API runs at:

```text
http://localhost:3000
```

Health check:

```text
GET http://localhost:3000/health
```

## Background Workers

VaultShare has separate background processes.

Start the vault expiry scheduler:

```bash
npm run expiry:scheduler
```

Start the file and vault cleanup worker:

```bash
npm run cleanup:worker
```

Run each process in a separate terminal.

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Compile TypeScript |
| `npm run start` | Start compiled application |
| `npm run typecheck` | Run TypeScript checks |
| `npm run db:test` | Test database connectivity |
| `npm run authorization:test` | Run authorization tests |
| `npm run encryption:test` | Run encryption tests |
| `npm run storage:test` | Run storage tests |
| `npm run cleanup:worker` | Start cleanup worker |
| `npm run expiry:scheduler` | Start expiry scheduler |
| `npm run email:test` | Run email test |

## API Overview

Base URL:

```text
http://localhost:3000/api/v1
```

| Method | Endpoint | Description |
|---|---|---|
| GET | `/auth/me` | Retrieve current authenticated user |
| POST | `/vaults` | Create a vault |
| GET | `/vaults` | List vaults |
| GET | `/vaults/:id` | Retrieve a vault |
| PATCH | `/vaults/:id` | Update a vault |
| DELETE | `/vaults/:id` | Delete a vault |
| POST | `/vaults/:id/shares` | Create a share |
| POST | `/shares/:shareCode/open` | Open a shared vault |
| POST | `/shares/:shareCode/write-requests` | Submit a write request |
| GET | `/vaults/:id/files` | List vault files |
| POST | `/vaults/:id/files` | Upload a file |
| GET | `/vaults/:id/files/:fileId/download` | Download a file |
| DELETE | `/vaults/:id/files/:fileId` | Delete a file |
| POST | `/access-requests/vaults/:vaultId` | Request vault access |
| PATCH | `/access-requests/:requestId/cancel` | Cancel an access request |

Additional routes support shared-file access, access-request reviews, share revocation and write-request reviews.

Authenticated endpoints require a valid Cognito access token and a provisioned VaultShare user.

## Security

VaultShare implements several security controls:

- AES-256-GCM encryption for vault content.
- Per-vault data encryption keys protected by a key-encryption key.
- Argon2id passphrase hashing.
- Cognito access-token verification.
- Per-vault authorization.
- Failed passphrase-attempt tracking.
- Database transactions and locking for sensitive access operations.
- Private file storage.
- Configurable expiry and cleanup behavior.

**Important:** Keep encryption keys and environment credentials outside source control. The local Docker configuration is intended for development, not production deployment.

## Testing

Run the available checks:

```bash
npm run typecheck
npm run build
npm run authorization:test
npm run encryption:test
npm run storage:test
npm run db:test
```

## Project Status

VaultShare is under active development. The repository contains the backend implementation and supporting infrastructure for its core security, sharing, expiry, file-storage and write-request workflows.

Deployment, production operations and any functionality not exposed by the current implementation should be treated as work in progress.

## License

Currently specified as ISC in `package.json`. Confirm the intended project license before publishing a release.
