
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
    // 1. Retrieve the authenticated user's Cognito profile.
    const cognitoUser = await getCognitoUserInfo(accessToken);

    // 2. Ensure UserInfo belongs to the JWT-authenticated identity.
    if (cognitoUser.sub !== expectedCognitoSub) {
        throw new AppError(
            401,
            "IDENTITY_MISMATCH",
            "Authenticated identity could not be verified.",
        );
    }

    // 3. Require a verified email address.
    if (!cognitoUser.emailVerified) {
        throw new AppError(
            403,
            "EMAIL_NOT_VERIFIED",
            "Please verify your email before using VaultShare.",
        );
    }

    // 4. Find an existing VaultShare user.
    const existingUser = await findUserByCognitoSub(cognitoUser.sub);

    if (existingUser) {
        // 5. Synchronize trusted Cognito profile information.
        if (
            existingUser.email !== cognitoUser.email ||
            !existingUser.emailVerified
        ) {
            return await updateUserProfile(cognitoUser);
        }

        return existingUser;
    }

    // 6. Create an internal VaultShare user on first login.
    try {
        return await createUser({
            cognitoSub: cognitoUser.sub,
            email: cognitoUser.email,
            emailVerified: cognitoUser.emailVerified,
        });
    } catch (error) {
        // Handle a simultaneous first-login request safely.
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
            return userAfterConflict;
        }

        throw error;
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
