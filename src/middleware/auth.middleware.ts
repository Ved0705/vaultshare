
import type { Request, Response, NextFunction } from "express";
import { AppError } from "../shared/app-error.js";
import { accessTokenVerifier } from "../infrastructure/cognito/token-verifier.js";
import { isAccessTokenRevoked } from "./token-revocation.js";

export interface AuthenticatedUser {
    cognitoSub: string;
    id?: string;
    jti?: string;
    tokenExpiresAt?: Date;
}

declare global {
    namespace Express {
        interface Request {
            user?: AuthenticatedUser;
        }
    }
}

export async function authenticate(
    req: Request,
    _res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const authorization = req.headers.authorization;

        if (!authorization?.startsWith("Bearer ")) {
            throw new AppError(
                401,
                "UNAUTHORIZED",
                "Authentication token is required.",
            );
        }

        const token = authorization.slice("Bearer ".length).trim();

        if (!token) {
            throw new AppError(
                401,
                "UNAUTHORIZED",
                "Authentication token is required.",
            );
        }

        const payload = await accessTokenVerifier.verify(token);

        if (typeof payload.sub !== "string" || !payload.sub || typeof payload.jti !== "string" || !payload.jti || typeof payload.exp !== "number") {
            throw new AppError(
                401,
                "INVALID_TOKEN",
                "Invalid authentication token.",
            );
        }

        if (await isAccessTokenRevoked(payload.jti)) {
            throw new AppError(401, "TOKEN_REVOKED", "Authentication token is no longer valid.");
        }

        // Authentication only: do not require a PostgreSQL user yet.
        req.user = { cognitoSub: payload.sub, jti: payload.jti, tokenExpiresAt: new Date(payload.exp * 1000) };

        next();
    } catch (error) {
        if (error instanceof AppError) {
            next(error);
            return;
        }

        next(
            new AppError(
                401,
                "INVALID_TOKEN",
                "Invalid or expired authentication token.",
            ),
        );
    }
}
