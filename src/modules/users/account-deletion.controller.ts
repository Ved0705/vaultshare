import type { Request, Response, NextFunction } from "express";

import { AppError } from "../../shared/app-error.js";
import { findUserByCognitoSub } from "./user.repository.js";
import { deleteAccount } from "./account-deletion.service.js";

export async function deleteCurrentAccount(
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const cognitoSub = req.user?.cognitoSub;

        if (!cognitoSub) {
            throw new AppError(
                401,
                "UNAUTHORIZED",
                "Authentication is required.",
            );
        }

        const user = await findUserByCognitoSub(cognitoSub);

        if (!user) {
            throw new AppError(
                404,
                "USER_NOT_FOUND",
                "VaultShare account could not be found.",
            );
        }

        await deleteAccount(user.id, cognitoSub);

        res.status(200).json({
            success: true,
            message: "Your VaultShare account has been deleted.",
        });
    } catch (error) {
        next(error);
    }
}