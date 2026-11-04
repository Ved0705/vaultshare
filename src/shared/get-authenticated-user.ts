
import type { Request } from "express";
import { AppError } from "./app-error.js";

export function getAuthenticatedUserId(req: Request): string {
    const userId = req.user?.id;

    if (!userId) {
        throw new AppError(
            401,
            "USER_NOT_PROVISIONED",
            "A provisioned VaultShare account is required.",
        );
    }

    return userId;
}
