import { eq } from "drizzle-orm";

import { db } from "../../db/client.js";
import { users } from "../../db/schema/users.js";
import { AppError } from "../../shared/app-error.js";

import { deleteCognitoUser } from "../../infrastructure/cognito/delete-user.js";

import {
    markAccountDeletionPending,
    destroyAccountVaultData,
    finalizeAccountDeletion,
} from "./account-deletion.repository.js";

export async function deleteAccount(
    userId: string,
    cognitoSub: string,
): Promise<void> {
    const [user] = await db
        .select({
            id: users.id,
            cognitoSub: users.cognitoSub,
            status: users.status,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

    if (!user || user.cognitoSub !== cognitoSub) {
        throw new AppError(
            404,
            "USER_NOT_FOUND",
            "VaultShare account could not be found.",
        );
    }

    if (user.status === "DELETED") {
        return;
    }

    // Block further application access immediately.
    if (user.status === "ACTIVE") {
        const marked = await markAccountDeletionPending(userId);

        if (!marked) {
            throw new AppError(
                409,
                "ACCOUNT_STATE_CHANGED",
                "Account deletion could not be started. Please retry.",
            );
        }
    } else if (user.status !== "DELETION_PENDING") {
        throw new AppError(
            409,
            "ACCOUNT_UNAVAILABLE",
            "This account cannot be deleted in its current state.",
        );
    }

    // Destroy vault data and queue encrypted file cleanup.
    // This operation is designed to be safely retried.
    await destroyAccountVaultData(userId);

    // Delete the Cognito identity.
    // If this fails, the account remains pending for retry.
    await deleteCognitoUser(cognitoSub);

    // Remove relational records and retain the DELETED tombstone.
    await finalizeAccountDeletion(userId);
}