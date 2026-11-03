
import type { Request, Response, NextFunction } from "express";
import { getOrCreateUser } from "./user.service.js";
import { AppError } from "../../shared/app-error.js";

export async function getCurrentUser(
    req: Request,
    res: Response,
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

        const accessToken = authorization
            .slice("Bearer ".length)
            .trim();

        const user = await getOrCreateUser(
            accessToken,
            req.user!.cognitoSub,
        );

        if (!user) {
            throw new AppError(
                404,
                "USER_NOT_FOUND",
                "Unable to retrieve VaultShare user.",
            );
        }

        res.status(200).json({
            success: true,
            data: {
                id: user.id,
                email: user.email,
                emailVerified: user.emailVerified,
            },
        });
    } catch (error) {
        next(error);
    }
}
