# VaultShare — Setup & Operations Guide

## 1. Overview

This guide explains how to configure and run the VaultShare backend in a local development environment.

The project uses Node.js, TypeScript, Express, PostgreSQL, Drizzle ORM, Docker Compose, and AWS Cognito.

## 2. Prerequisites

Install the following:

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

The application expects the following variables:

| Variable | Purpose |
|---|---|
| `NODE_ENV` | Application environment |
| `PORT` | HTTP server port |
| `COGNITO_USERINFO_URL` | Cognito UserInfo endpoint |
| `COGNITO_REGION` | Cognito AWS region |
| `COGNITO_USER_POOL_ID` | Cognito User Pool identifier |
| `COGNITO_CLIENT_ID` | Cognito application client identifier |
| `DATABASE_URL` | PostgreSQL connection string |
| `STORAGE_PATH` | Local private file storage directory |
| `MAIL_HOST` | SMTP server hostname |
| `MAIL_PORT` | SMTP server port |
| `MAIL_FROM` | Sender email address |
| `VAULT_KEK_BASE64` | Base64-encoded 32-byte encryption key |

The actual configuration values belong in the private local `.env` file.

**Never commit `.env` or place real credentials in `.env.example`.**

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

The PostgreSQL container uses an internal port of 5432 mapped to host port 5433.

## 7. Database Migrations

Apply the existing Drizzle migrations:

```powershell
npx drizzle-kit migrate
```

Test database connectivity:

```powershell
npm run db:test
```

Migration files are maintained under:

```text
src/db/migrations/
```

Schema definitions are maintained under:

```text
src/db/schema/
```

## 8. Start the Backend

Start the development server:

```powershell
npm run dev
```

The server uses the configured `PORT`, defaulting to 3000.

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

VaultShare has two separate background processes.

### Vault expiry scheduler

```powershell
npm run expiry:scheduler
```

Periodically processes expired vaults according to their configured expiry policy.

### File cleanup worker

```powershell
npm run cleanup:worker
```

Processes pending cleanup jobs for stored resources.

Run these processes separately from the API server.

## 10. Email Testing

VaultShare uses Nodemailer for email integration and Mailpit for local development testing.

Start Mailpit through Docker Compose:

```powershell
docker compose up -d mailpit
```

Run the email test:

```powershell
npm run email:test
```

Inspect received messages at:

```text
http://localhost:8025
```

The email test verifies the configured SMTP integration. It does not imply that all application notification workflows are implemented.

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
| `npm run email:test` | Test email integration |
| `npm run expiry:scheduler` | Start vault expiry scheduler |
| `npm run cleanup:worker` | Start cleanup worker |

## 12. Build and Production-Mode Startup

Compile the project:

```powershell
npm run build
```

Start the compiled application:

```powershell
npm run start
```

The build output is generated in `dist/`.

The application build alone does not constitute a production deployment. Production infrastructure, secrets management, HTTPS, monitoring, and operational procedures require separate configuration.

## 13. Verification Checklist

Run the following checks before considering a development change complete:

```powershell
npm run typecheck
npm run build
npm run authorization:test
npm run encryption:test
npm run storage:test
npm run db:test
```

Check whitespace and patch formatting:

```powershell
git diff --check
```

## 14. Shutdown and Cleanup

Stop local services:

```powershell
docker compose down
```

To remove the local PostgreSQL volume as well:

```powershell
docker compose down -v
```

**Warning:** `docker compose down -v` deletes the PostgreSQL Docker volume and its local database data. Do not run it unless that data can be discarded.

## 15. Troubleshooting

### PostgreSQL connection failure

- Confirm Docker Desktop is running.
- Check container status using `docker compose ps`.
- Verify the database connection string uses the configured host port.
- Inspect PostgreSQL logs:

```powershell
docker compose logs postgres
```

### Mailpit unavailable

Check the container:

```powershell
docker compose logs mailpit
```

Confirm that the configured SMTP host and port match the local Compose configuration.

### Environment validation failure

- Verify required environment variables are present.
- Check URL formatting for Cognito and database configuration.
- Ensure the KEK is valid Base64 and decodes to exactly 32 bytes.
- Do not share or commit the actual `.env` file.

### TypeScript build failure

Run:

```powershell
npm run typecheck
```

Resolve the reported errors before rebuilding.

## 16. Operational Notes

- Keep `.env` private.
- Keep private storage outside publicly served directories.
- Do not expose database or SMTP development ports publicly.
- Monitor background cleanup failures.
- Back up required data before destructive maintenance.
- Do not use local development credentials as production credentials.

---

**Document status:** Local development and operations guide for the current VaultShare backend implementation.