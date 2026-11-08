import { AppError } from "../../shared/app-error.js";
import { getCognitoUserInfo } from "../../infrastructure/cognito/user-info.js";
import {
    findUserByCognitoSub,
    createUser,
    updateUserByCognitoSub,
} from "./user.repository.js";

export async function getOrCreateUser(
    accessToken: string,
    expectedCognitoSub: string,
) {
    const cognitoUser = await getCognitoUserInfo(accessToken);

    if (cognitoUser.sub !== expectedCognitoSub) {
        throw new AppError(
            401,
            "IDENTITY_MISMATCH",
            "Authenticated identity could not be verified.",
        );
    }

    if (!cognitoUser.emailVerified) {
        throw new AppError(
            403,
            "EMAIL_NOT_VERIFIED",
            "Please verify your email before using VaultShare.",
        );
    }

    const existingUser = await findUserByCognitoSub(cognitoUser.sub);

    if (existingUser) {
        ensureAccountActive(existingUser.status);

        if (
            existingUser.email !== cognitoUser.email ||
            !existingUser.emailVerified
        ) {
            return await updateUserProfile(cognitoUser);
        }

        return existingUser;
    }

    try {
        return await createUser({
            cognitoSub: cognitoUser.sub,
            email: cognitoUser.email,
            emailVerified: cognitoUser.emailVerified,
        });
    } catch (error) {
        const isUniqueViolation =
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "23505";

        if (!isUniqueViolation) {
            throw error;
        }

        const userAfterConflict = await findUserByCognitoSub(
            cognitoUser.sub,
        );

        if (userAfterConflict) {
            ensureAccountActive(userAfterConflict.status);
            return userAfterConflict;
        }

        throw error;
    }
}

function ensureAccountActive(status: string) {
    if (status !== "ACTIVE") {
        throw new AppError(
            403,
            "ACCOUNT_UNAVAILABLE",
            "This VaultShare account is unavailable.",
        );
    }
}

async function updateUserProfile(cognitoUser: {
    sub: string;
    email: string;
    emailVerified: boolean;
}) {
    const updatedUser = await updateUserByCognitoSub(
        cognitoUser.sub,
        {
            email: cognitoUser.email,
            emailVerified: cognitoUser.emailVerified,
        },
    );

    if (!updatedUser) {
        throw new AppError(
            404,
            "USER_NOT_FOUND",
            "Unable to update VaultShare user profile.",
        );
    }

    return updatedUser;
}