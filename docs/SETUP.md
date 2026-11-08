# VaultShare — Setup & Operations Guide

## 1. Overview

This guide explains how to configure and run the VaultShare backend in a local development environment.

The project uses Node.js, TypeScript, Express 5, PostgreSQL 17, Drizzle ORM, Docker Compose, and AWS Cognito.

The local setup uses PostgreSQL and Mailpit through Docker Compose. The API and background processes run separately through Node.js.

## 2. Prerequisites

Install:

- Node.js and npm
- Git
- Docker Desktop
- An AWS Cognito User Pool and application client configured for development

Verify the installations:

```powershell
node --version
npm --version
git --version
docker --version
docker compose version
```

## 3. Clone the Repository

```powershell
git clone https://github.com/Ved0705/vaultshare.git
cd vaultshare
```

## 4. Install Dependencies

```powershell
npm install
```

This installs the dependencies defined in `package.json`.

## 5. Environment Configuration

Create a local `.env` file using `.env.example` as a reference.

Do not overwrite an existing `.env` file.

The application expects the following configuration:

| Variable | Purpose |
|---|---|
| `NODE_ENV` | Application environment |
| `PORT` | HTTP server port |
| `CORS_ORIGINS` | Comma-separated exact browser origins allowed to call the API |
| `COGNITO_USERINFO_URL` | Cognito UserInfo endpoint |
| `COGNITO_REGION` | Cognito AWS region |
| `COGNITO_USER_POOL_ID` | Cognito User Pool identifier |
| `COGNITO_CLIENT_ID` | Cognito application client identifier |
| `DATABASE_URL` | PostgreSQL connection string |
| `STORAGE_PATH` | Local private file storage directory |
| `MAIL_HOST` | SMTP server hostname |
| `MAIL_PORT` | SMTP server port |
| `MAIL_FROM` | Sender email address |
| `VAULT_KEK_BASE64` | Base64-encoded 32-byte KEK version 1 (retain for old records) |
| `VAULT_KEK_V2_BASE64` | Optional independent 32-byte KEK version 2 for controlled rotation |
| `VAULT_KEK_CURRENT_VERSION` | KEK version used for new vault and WRITE-request records (default `1`) |

For the local Docker Compose configuration, use:

```env
NODE_ENV=development
PORT=3000
CORS_ORIGINS=http://localhost:5173

DATABASE_URL=postgresql://vaultshare:local_dev_password@localhost:5433/vaultshare

STORAGE_PATH=./private-storage

MAIL_HOST=localhost
MAIL_PORT=1025
MAIL_FROM=no-reply@vaultshare.local

COGNITO_USERINFO_URL=
COGNITO_REGION=
COGNITO_USER_POOL_ID=
COGNITO_CLIENT_ID=

VAULT_KEK_BASE64=
```

Configure the Cognito values using your development User Pool and application client. Set CORS_ORIGINS to the exact frontend origin(s), separated by commas. Do not use a wildcard for authenticated browser clients. Production deployments must replace the localhost development origin with their trusted HTTPS frontend origins.

Generate a 32-byte encryption key encoded in Base64:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Set the generated value as `VAULT_KEK_BASE64`.

Keep the key stable for the lifetime of the data encrypted with it. Replacing it without a corresponding key-rotation or re-encryption procedure can make existing vault content undecryptable. For rotation, retain the old value as version 1, configure a new independent value in `VAULT_KEK_V2_BASE64`, and follow the controlled procedure in `docs/SECURITY.md`. Never remove the old key just because the rotation command completed.

**Never commit `.env`, expose real credentials, or place encryption keys in `.env.example`.**

## 6. Start Local Infrastructure

Start PostgreSQL and Mailpit:

```powershell
docker compose up -d
```

Check running containers:

```powershell
docker compose ps
```

### Local services

| Service | Host address | Purpose |
|---|---|---|
| PostgreSQL | `localhost:5433` | Application database |
| Mailpit SMTP | `localhost:1025` | Local email delivery |
| Mailpit UI | `http://localhost:8025` | Inspect test emails |

The PostgreSQL container uses internal port `5432`, mapped to host port `5433`.

The Compose configuration binds these ports to localhost. Do not expose development services publicly.

## 7. Database Migrations

Apply the existing Drizzle migrations:

```powershell
npx drizzle-kit migrate
```

Test database connectivity:

```powershell
npm run db:test
```

Migration files:

```text
src/db/migrations/
```

Schema definitions:

```text
src/db/schema/
```

## 8. Start the Backend

Start the development server:

```powershell
npm run dev
```

The server uses the configured `PORT`, defaulting to `3000`.

Check the health endpoint:

```powershell
Invoke-RestMethod http://localhost:3000/health
```

Expected response structure:

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "service": "VaultShare API"
  }
}
```

## 9. Background Processes

VaultShare has two independent background processes. Run each in a separate terminal.

### Vault expiry scheduler

```powershell
npm run expiry:scheduler
```

The scheduler checks for expired vaults approximately every 60 seconds and invokes vault lifecycle processing.

### File and vault cleanup worker

```powershell
npm run cleanup:worker
```

The cleanup worker processes pending file and destroyed-vault cleanup jobs.

It checks for available work periodically, recovers stale processing claims, and retries failed jobs using exponential backoff.

Jobs that exceed their configured maximum attempts are marked `FAILED`. These require operational investigation; do not assume physical deletion completed merely because a cleanup job was queued.

## 10. Email Testing

VaultShare uses Nodemailer for email integration and Mailpit for local SMTP testing.

Start Mailpit:

```powershell
docker compose up -d mailpit
```

Run the email test:

```powershell
npm run email:test
```

Inspect received messages:

```text
http://localhost:8025
```

This test verifies configured SMTP integration. It does not establish that all application notification workflows are implemented.

## 11. Available Development Commands

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
| `npm run lifecycle:test` | Run vault lifecycle integration tests |
| `npm run file-cleanup:test` | Run file cleanup integration tests |
| `npm run write-race:test` | Run write/revocation race tests |
| `npm run share-isolation:test` | Run share revocation isolation tests |
| `npm run email:test` | Test email integration |
| `npm run expiry:scheduler` | Start vault expiry scheduler |
| `npm run cleanup:worker` | Start cleanup worker |
| `npm run kek:rotate` | Dry-run KEK v1-to-v2 envelope rotation (requires both keys) |

### Controlled KEK rotation (maintenance operation)

Do not run this against a live application. First take a restorable database backup and stop the API and all background workers. Configure both KEK versions and set `VAULT_KEK_CURRENT_VERSION=2`, then apply migrations. Run the dry run:

```powershell
npm run kek:rotate
```

Only after reviewing the counts, commit the single database transaction:

```powershell
npm run kek:rotate -- --apply
```

The command rewraps vault and WRITE-request DEKs; file DEKs remain protected by their parent vault DEK. Verify both tables have no version-1 records before restarting services. Keep the old key in configuration until recovery and backup retention have been validated. See `docs/SECURITY.md` for the full procedure.

### Security middleware verification

```powershell
npm run security:middleware:test
```

Production requires explicit HTTPS-only `CORS_ORIGINS`. Set `TRUST_PROXY_HOPS` only to the exact trusted reverse-proxy hop count; leave it at `0` for direct/local connections.

## 12. Verification Checklist

Run the following checks after making backend changes:

```powershell
npm run typecheck
npm run build
npm run authorization:test
npm run encryption:test
npm run storage:test
npm run db:test
npm run lifecycle:test
npm run file-cleanup:test
npm run write-race:test
npm run share-isolation:test
```

Check whitespace and patch formatting:

```powershell
git diff --check
```

Some integration tests require a working local PostgreSQL database and correctly configured environment variables.

## 13. Build and Production-Mode Startup

Compile the project:

```powershell
npm run build
```

Start the compiled application:

```powershell
npm run start
```

The build output is generated in `dist/`.

A successful build does not mean the application is production-ready. Production deployment requires separate infrastructure, HTTPS, secure secrets management, monitoring, backup and recovery procedures, and operational controls.

## 14. Shutdown and Cleanup

Stop local services:

```powershell
docker compose down
```

To remove the local PostgreSQL volume as well:

```powershell
docker compose down -v
```

**Warning:** `docker compose down -v` permanently deletes the PostgreSQL Docker volume and its local database data. Do not run it unless that data can be discarded.

Private file storage under `STORAGE_PATH` is separate from the PostgreSQL Docker volume. Removing the Compose volume does not necessarily remove stored files.

## 15. Troubleshooting

### PostgreSQL connection failure

- Confirm Docker Desktop is running.
- Check container status using `docker compose ps`.
- Verify `DATABASE_URL` uses host port `5433`.
- Inspect PostgreSQL logs:

```powershell
docker compose logs postgres
```

### Mailpit unavailable

Inspect the container:

```powershell
docker compose logs mailpit
```

Confirm the configured SMTP host and port match the local Compose configuration.

### Environment validation failure

- Verify required environment variables are present.
- Check Cognito and database URL formatting.
- Ensure the KEK is valid Base64 and decodes to exactly 32 bytes.
- Do not share or commit the actual `.env` file.

### TypeScript build failure

Run:

```powershell
npm run typecheck
```

Resolve the reported errors before rebuilding.

### Cleanup jobs remain pending or fail

- Confirm PostgreSQL is available.
- Confirm the cleanup worker is running.
- Inspect cleanup job status and recorded error details in the database.
- Investigate jobs marked `FAILED` before considering the associated storage cleanup complete.

## 16. Security and Cost Notes

- Keep `.env` and encryption keys private.
- Keep encrypted file storage outside publicly served directories.
- Do not expose database or SMTP development ports publicly.
- Back up required data before destructive maintenance.
- Do not use local development credentials as production credentials.
- Do not assume that AWS services or third-party integrations are permanently free. Check current pricing and usage limits before enabling paid services or deploying infrastructure.

The local Docker setup is intended for development. It does not require deploying PostgreSQL or Mailpit to a paid cloud service.

## 17. Document Status

This guide describes the current local development setup and available operational commands. It is not a production deployment or disaster-recovery guide.