import type { Request, Response, NextFunction } from "express";
import { AppError } from "../shared/app-error.js";
import { findUserByCognitoSub } from "../modules/users/user.repository.js";


export async function requireProvisionedUser(
    req: Request,
    _res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const cognitoSub = req.user?.cognitoSub;

        if (!cognitoSub) {
            throw new AppError(401, "UNAUTHORIZED", "Authentication is required.");
        }

        const user = await findUserByCognitoSub(cognitoSub);

        if (!user) {
            throw new AppError(
                401,
                "USER_NOT_PROVISIONED",
                "User account has not been provisioned.",
            );
        }

        if (!user.emailVerified) {
            throw new AppError(
                403,
                "EMAIL_NOT_VERIFIED",
                "Email verification is required.",
            );
        }

        req.user = {
            cognitoSub,
            id: user.id,
        };
        next();
    } catch (error) {
        next(error);
    }
}