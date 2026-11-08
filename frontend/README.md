# VaultShare Web

The first VaultShare V1 browser client, built with React, TypeScript and Vite.

## Included in this first frontend slice

- AWS Cognito email/password sign-up, email confirmation and sign-in.
- Authenticated workspace shell and current-user identity.
- Vault list, search, create, revoke and destroy actions.
- Folder list and folder creation.
- Personal audit history.
- Responsive dark interface with loading, empty, error and success states.

The client only calls endpoints already implemented by the backend. It does not add backend features or claim to provide an in-app notification inbox.

## Local setup

From the repository root:

```powershell
cd frontend
npm install
Copy-Item .env.example .env
```

Set the Cognito User Pool ID and public app-client ID in `frontend/.env`. The app client must be configured for a browser/public client without a client secret and must allow the password-based Cognito flows used by the SDK. Set `VITE_API_BASE_URL` to the backend API URL.

Start the backend separately from the repository root using the existing instructions in the root README. Ensure its `CORS_ORIGINS` includes `http://localhost:5173`.

Then run:

```powershell
npm run dev
```

Open http://localhost:5173.

## Build checks

```powershell
npm run typecheck
npm run build
```

No credentials belong in source control. Vite variables prefixed with `VITE_` are public browser configuration; never put secrets or a Cognito client secret in them.
