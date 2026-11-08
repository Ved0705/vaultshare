# VaultShare — API Reference

## 1. Overview

VaultShare exposes a versioned REST API using Express 5.

**Base path:** `/api/v1`

The API supports vault management, recipient sharing, access requests, write requests, and encrypted file operations.

## 2. Authentication

Protected endpoints require a valid AWS Cognito access token.

Include the token in the HTTP Authorization header:

```http
Authorization: Bearer <COGNITO_ACCESS_TOKEN>
```

Vault routes, share-access routes, shared-file routes, and access-request routes additionally require a provisioned application user.

`GET /api/v1/auth/me` and `POST /api/v1/auth/logout` require authentication.

`GET /health` is public.

Authentication does not automatically grant access to a vault. Application-level authorization and share restrictions are enforced separately.

## 3. Account Management

| Method | Endpoint | Description | Authentication |
|---|---|---|---|
| DELETE | `/api/v1/users/me` | Delete the authenticated user's VaultShare account | Required |

### Delete current account

`DELETE /api/v1/users/me`

Deletes the authenticated user's VaultShare account through the account-deletion workflow. The operation marks the account as pending, destroys associated vault data and queues encrypted file cleanup, deletes the Cognito identity, and finalizes the application account as a deleted tombstone. If an external Cognito deletion step fails, the account remains pending for worker retry.

## 4. Health and Authentication

| Method | Endpoint | Description | Authentication |
|---|---|---|---|
| GET | `/health` | API health check | Public |
| GET | `/api/v1/auth/me` | Retrieve current authenticated user | Required |
| POST | `/api/v1/auth/logout` | Revoke the presented access-token JTI for this application | Required |

## 5. Folder Management

Base path: `/api/v1/folders`. All folder operations require authentication and a provisioned user. A folder name is trimmed and must contain 1–100 characters.

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/folders` | Create a folder |
| GET | `/api/v1/folders` | List the caller's folders |
| PATCH | `/api/v1/folders/:id` | Rename an owned folder |
| DELETE | `/api/v1/folders/:id` | Delete a folder and move its vaults to the root |

Create and rename request body: { "name": "Project Notes" }

The list endpoint returns only folders owned by the authenticated user. An attempt to update or delete another user's folder returns not found.

Folder deletion is owner-scoped and non-destructive. Vaults are detached from the folder; their encrypted content, files, shares, and lifecycle state are preserved.

## 6. Vault Management

Base path: `/api/v1/vaults`

All vault endpoints require authentication and a provisioned user.

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/vaults` | Create a vault |
| GET | `/api/v1/vaults` | List vaults |
| GET | `/api/v1/vaults/:id` | Retrieve a vault |
| PATCH | `/api/v1/vaults/:id` | Update vault metadata |
| POST | `/api/v1/vaults/:id/revoke` | Revoke vault access and destroy derived vaults |
| DELETE | `/api/v1/vaults/:id` | Permanently destroy a vault |

### Create vault

`POST /api/v1/vaults`

Request body:

```json
{
  "name": "Project Notes",
  "description": "Temporary project information",
  "content": "Confidential content",
  "overallTtlSeconds": 86400,
  "expiryPolicy": "DESTROY",
  "folderId": null
}
```

Validation:

- `name`: 1–150 characters.
- `description`: optional, maximum 500 characters.
- `content`: 1–900,000 characters.
- `overallTtlSeconds`: positive integer.
- `expiryPolicy`: `DESTROY` or `REVOKE_ACCESS`; defaults to `DESTROY`.
- `folderId`: optional UUID or null.

### List vaults

`GET /api/v1/vaults`

Query parameters:

| Parameter | Default | Constraints |
|---|---|---|
| limit | 20 | 1–100 |
| offset | 0 | Minimum 0 |

### Update vault

`PATCH /api/v1/vaults/:id`

Supports updating:

- `name`
- `description`
- `folderId`

At least one field must be provided. Vault metadata and file contents become immutable after the first reader opens the vault.

### Revoke vault access

`POST /api/v1/vaults/:id/revoke`

Revokes access to the source vault and expires active and pending shares across its lineage.

All derived vaults are permanently destroyed, including their encrypted payloads. The source vault's encrypted payload is retained.

This operation is irreversible for the derived vaults.

### Permanently destroy a vault

`DELETE /api/v1/vaults/:id`

Permanently destroys the selected vault and its derived vaults. Encrypted payloads are cleared and physical file cleanup is queued for asynchronous processing.

## 7. Share Management

Base path: `/api/v1/vaults/:id/shares`

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/vaults/:id/shares` | Create a share |
| PATCH | `/api/v1/vaults/:id/shares/:shareId/revoke` | Revoke an individual share |
| PATCH | `/api/v1/vaults/:id/shares/revoke-all` | Revoke all shares for a vault |
| PATCH | `/api/v1/vaults/:id/shares/:shareId/extend` | Extend remaining access count and/or post-open TTL |

### Generate a passphrase

`POST /api/v1/vaults/:id/shares/passphrase`

Generates a new 32-character URL-safe Base64URL passphrase using 24 cryptographically random bytes (192 bits of entropy). The operation is owner-scoped, accepts no request body, and does not persist the generated secret. The caller must securely copy it before navigating away; it is not retrievable later.

Example response: success=true, data.passphrase contains the generated secret, data.entropyBits=192.

### Create share

`POST /api/v1/vaults/:id/shares`

Request body:

```json
{
  "readerId": "00000000-0000-4000-8000-000000000000",
  "permissions": ["READ"],
  "maxAccessCount": 5,
  "postOpenTtlSeconds": 3600,
  "passphrase": "example-passphrase-123"
}
```

Validation:

- `readerId`: UUID.
- `permissions`: one or both of `READ` and `WRITE`, without duplicates.
- `maxAccessCount`: integer from 1 to 1000.
- `postOpenTtlSeconds`: positive integer or null.
- `passphrase`: 12–128 characters.

Individual share revocation affects the selected share and does not destroy the vault or its derived-vault lineage.

### Extend share access

`PATCH /api/v1/vaults/:id/shares/:shareId/extend`

Request body:

```json
{
  "additionalAccesses": 2,
  "extendPostOpenBySeconds": 3600
}
```

Both fields are optional; `additionalAccesses` defaults to 1. Extensions are owner-controlled and are allowed only while the vault and reader-specific post-open window remain valid. A share exhausted only by its access count can be reactivated by this operation. A reader whose post-open TTL has expired, or whose share was revoked, cannot be renewed. Any extended post-open expiry is capped by the vault's overall expiry.

When a reader consumes the final permitted open, the share transitions to `expired`. That reader's already-open session can still access shared files until its post-open TTL or the vault's overall TTL expires; no further opens are allowed.

## 8. Share Access

Base path: `/api/v1/shares`

These routes require authentication and a provisioned user.

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/shares/:shareCode/open` | Open a shared vault |
| POST | `/api/v1/shares/:shareCode/write-requests` | Submit a proposed content change |
| POST | `/api/v1/shares/:shareCode/files/list` | List files available through a share |
| POST | `/api/v1/shares/:shareCode/files/:fileId/download` | Download a shared file |

### Open a share

`POST /api/v1/shares/:shareCode/open`

The operation checks the share's access state, passphrase, permissions, expiration, and successful-open limit.

Only successful opens increment the access counter.

### Submit a write request

`POST /api/v1/shares/:shareCode/write-requests`

Request body:

```json
{
  "proposedContent": "Proposed replacement content",
  "passphrase": "example-passphrase-123"
}
```

Validation:

- `proposedContent`: 1–900,000 characters.
- `passphrase`: 1–128 characters.

Write requests are reviewed by the vault owner. Approval creates a derived vault rather than directly overwriting the original.

## 9. Access Requests

Base path: `/api/v1/access-requests`

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/access-requests/vaults/:vaultId` | Request access to a vault |
| PATCH | `/api/v1/access-requests/:requestId/cancel` | Cancel an access request |

### Create access request

`POST /api/v1/access-requests/vaults/:vaultId`

Request body:

```json
{
  "message": "I would like access to this vault."
}
```

The message is optional and limited to 500 characters.

### Owner access-request operations

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/vaults/:id/access-requests` | List access requests for a vault |
| PATCH | `/api/v1/vaults/:id/access-requests/:requestId/review` | Review an access request |

These operations are registered under the authenticated vault routes.

## 10. Write Request Review

Base path: `/api/v1/vaults/:id/write-requests`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/vaults/:id/write-requests` | List write requests |
| GET | `/api/v1/vaults/:id/write-requests/:requestId` | Retrieve a write request |
| POST | `/api/v1/vaults/:id/write-requests/:requestId/review` | Approve or reject a write request |

### Review a write request

`POST /api/v1/vaults/:id/write-requests/:requestId/review`

Request body:

```json
{
  "decision": "APPROVE"
}
```

Allowed decisions:

- `APPROVE`
- `REJECT`

The owner must satisfy the applicable authorization and lifecycle checks.

## 11. File Management

Base path: `/api/v1/vaults/:id/files`

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/vaults/:id/files` | Upload a file |
| GET | `/api/v1/vaults/:id/files` | List vault files |
| GET | `/api/v1/vaults/:id/files/:fileId/download` | Download a file |
| DELETE | `/api/v1/vaults/:id/files/:fileId` | Delete a file |

### Upload file

`POST /api/v1/vaults/:id/files`

Content type: `multipart/form-data`

Form field:

- `file`: the file to upload.

The current upload middleware accepts one file per request. The maximum size is configured by MAX_FILE_SIZE_BYTES (default 10 MiB; hard maximum 100 MiB). Filenames must be present and no longer than 255 characters. MIME types are not allowlisted. No per-user or per-vault aggregate storage quota is currently enforced.

### List vault files

`GET /api/v1/vaults/:id/files`

Lists files associated with the specified vault, subject to authorization.

### Download a file

`GET /api/v1/vaults/:id/files/:fileId/download`

Downloads a file associated with the specified vault, subject to authorization.

### Delete a file

`DELETE /api/v1/vaults/:id/files/:fileId`

Deletes a file associated with the specified vault. Physical blob cleanup is handled by the cleanup process.

## 12. Shared File Operations

Base path: `/api/v1/shares`

These routes require authentication and a provisioned user.

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/shares/:shareCode/files/list` | List files accessible through a share |
| POST | `/api/v1/shares/:shareCode/files/:fileId/download` | Download a file accessible through a share |

Shared-file operations enforce the applicable share permissions and access restrictions.

## 13. Lifecycle and Asynchronous Cleanup

Vault expiry is processed by the expiry scheduler.

Depending on the configured expiry policy:

- `DESTROY`: the source vault and its derived vaults are destroyed.
- `REVOKE_ACCESS`: access to the source vault is revoked, its encrypted payload is retained, and its derived vaults are destroyed.

In both cases, active and pending shares across the affected lineage are invalidated. Pending write requests are rejected and their encrypted proposal payloads are cleared.

Physical file deletion is asynchronous. Cleanup jobs are processed by the cleanup worker, which retries failed jobs and marks jobs as `FAILED` after the configured maximum number of attempts.

## 14. Response and Error Handling

Successful controller responses generally use a JSON envelope containing a `success` field and either `data` or a message.

Errors are passed through the centralized error handler.

Clients should not assume that authentication alone grants permission to access a vault or file. Authorization is evaluated by the relevant application service.

## 15. Implementation Notes

- The API is implemented using Express 5.
- Request validation uses Zod schemas.
- Authentication uses AWS Cognito access tokens.
- Vault content and file operations are subject to application-level authorization.
- The machine-readable OpenAPI 3.1 contract is maintained at docs/openapi.yaml. It can be imported into Swagger UI / Swagger Editor; a hosted interactive Swagger UI is not bundled into the API.

---

This document describes the routes registered in the current application. Request validation details should be kept synchronized with their corresponding Zod schemas as the implementation evolves.

## 16. Personal Audit History

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/audit-events` | List the authenticated user's own audit events |

Query parameters: limit (default 25, range 1–100) and offset (default 0, minimum 0).

The endpoint returns the caller's events only. Each event contains its action, method, normalized route, resource UUID where available, HTTP status code, and creation timestamp. Share codes and UUIDs are replaced in the stored route with placeholders. Request bodies and query strings are not stored. Audit persistence occurs asynchronously after the response finishes; this history is not a tamper-proof compliance ledger.

## 17. Logout

POST /api/v1/auth/logout adds the presented token JTI to the application's revoked-token table until token expiry. It returns HTTP 204 on success. Clients should also clear their local token material. This endpoint revokes the token for VaultShare API use; it does not replace Cognito-wide sign-out on every client/device.

## 18. Notification delivery

Notifications are enqueued transactionally for share creation/revocation and access/WRITE request creation/review. Email content is metadata-only. The API does not deliver mail inline; a separate process must run `npm run notifications:worker`. See Setup & Operations.

## 19. OpenAPI

The OpenAPI 3.1 specification is maintained in openapi.yaml. Keep it synchronized with the registered Express routes and Zod validators.
