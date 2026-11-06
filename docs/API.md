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

Vault routes and share-access routes additionally require a provisioned application user.

`GET /api/v1/auth/me` requires authentication.

`GET /health` is public.

Authentication does not automatically grant access to a vault. Application-level authorization and share restrictions are enforced separately.

## 3. Health and Authentication

| Method | Endpoint | Description | Authentication |
|---|---|---|---|
| GET | `/health` | API health check | Public |
| GET | `/api/v1/auth/me` | Retrieve current authenticated user | Required |

## 4. Vault Management

Base path: `/api/v1/vaults`

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/vaults` | Create a vault |
| GET | `/api/v1/vaults` | List vaults |
| GET | `/api/v1/vaults/:id` | Retrieve a vault |
| PATCH | `/api/v1/vaults/:id` | Update vault metadata |
| DELETE | `/api/v1/vaults/:id` | Delete a vault |

All vault endpoints require authentication and a provisioned user.

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

At least one field must be provided.

## 5. Share Management

Base path: `/api/v1/vaults/:id/shares`

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/vaults/:id/shares` | Create a share |
| PATCH | `/api/v1/vaults/:id/shares/:shareId/revoke` | Revoke an individual share |
| PATCH | `/api/v1/vaults/:id/shares/revoke-all` | Revoke all shares for a vault |

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

## 6. Share Access

Base path: `/api/v1/shares`

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/shares/:shareCode/open` | Open a shared vault |
| POST | `/api/v1/shares/:shareCode/write-requests` | Submit a proposed content change |
| POST | `/api/v1/shares/:shareCode/files/list` | List files available through a share |
| POST | `/api/v1/shares/:shareCode/files/:fileId/download` | Download a shared file |

These routes require authentication and a provisioned user.

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

## 7. Access Requests

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

## 8. Write Request Review

Base path: `/api/v1/vaults/:id/write-requests`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/vaults/:id/write-requests` | List write requests |
| GET | `/api/v1/vaults/:id/write-requests/:requestId` | Retrieve a write request |
| POST | `/api/v1/vaults/:id/write-requests/:requestId/review` | Approve or reject a write request |

Review request body:

```json
{
  "decision": "APPROVE"
}
```

Allowed decisions:
- `APPROVE`
- `REJECT`

The owner must satisfy the applicable authorization and lifecycle checks.

## 9. File Management

Base path: `/api/v1/vaults/:id/files`

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/vaults/:id/files` | Upload a file |
| GET | `/api/v1/vaults/:id/files` | List vault files |
| GET | `/api/v1/vaults/:id/files/:fileId/download` | Download a file |
| DELETE | `/api/v1/vaults/:id/files/:fileId` | Delete a file |

### Upload file

`POST /api