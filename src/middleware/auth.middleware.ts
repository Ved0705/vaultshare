
import type { Request, Response, NextFunction } from "express";
import { AppError } from "../shared/app-error.js";
import { accessTokenVerifier } from "../infrastructure/cognito/token-verifier.js";
import { findUserByCognitoSub } from "../modules/users/user.repository.js";

export interface AuthenticatedUser {
    cognitoSub: string;
    id: string;
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
            throw new AppError(401, "UNAUTHORIZED", "Authentication token is required.");
        }

        const token = authorization.slice("Bearer ".length).trim();

        if (!token) {
            throw new AppError(401, "UNAUTHORIZED", "Authentication token is required.");
        }

        const payload = await accessTokenVerifier.verify(token);

        if (typeof payload.sub !== "string" || !payload.sub) {
            throw new AppError(401, "INVALID_TOKEN", "Invalid authentication token.");
        }

        const user = await findUserByCognitoSub(payload.sub);

        if (!user) {
            throw new AppError(401, "USER_NOT_PROVISIONED", "User account has not been provisioned.");
        }

        if (!user.emailVerified) {
            throw new AppError(403, "EMAIL_NOT_VERIFIED", "Email verification is required.");
        }

        req.user = {
            cognitoSub: payload.sub,
            id: user.id,
        };

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
