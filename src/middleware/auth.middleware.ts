
import type { Request, Response, NextFunction } from "express";
import { AppError } from "../shared/app-error.js";
import { accessTokenVerifier } from "../infrastructure/cognito/token-verifier.js";
import { db } from "../db/client.js";
import { revokedAccessTokens } from "../db/schema/revoked-access-tokens.js";
import { eq } from "drizzle-orm";

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

        const [revoked] = await db.select({ jti: revokedAccessTokens.jti })
            .from(revokedAccessTokens)
            .where(eq(revokedAccessTokens.jti, payload.jti))
            .limit(1);
        if (revoked) throw new AppError(401, "TOKEN_REVOKED", "Authentication token is no longer valid.");

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
