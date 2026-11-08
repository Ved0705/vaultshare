import {
    AdminDeleteUserCommand,
    CognitoIdentityProviderClient,
    ListUsersCommand,
    UserNotFoundException,
} from "@aws-sdk/client-cognito-identity-provider";

import { env } from "../../config/env.js";
import { AppError } from "../../shared/app-error.js";

const cognitoClient = new CognitoIdentityProviderClient({
    region: env.COGNITO_REGION,
});

export async function deleteCognitoUser(
    cognitoSub: string,
): Promise<void> {
    try {
        const result = await cognitoClient.send(
            new ListUsersCommand({
                UserPoolId: env.COGNITO_USER_POOL_ID,
                Filter: `sub = "${cognitoSub}"`,
                Limit: 1,
            }),
        );

        const cognitoUsername = result.Users?.[0]?.Username;

        // Already deleted: make the operation idempotent.
        if (!cognitoUsername) {
            return;
        }

        await cognitoClient.send(
            new AdminDeleteUserCommand({
                UserPoolId: env.COGNITO_USER_POOL_ID,
                Username: cognitoUsername,
            }),
        );
    } catch (error) {
        if (
            error instanceof UserNotFoundException ||
            (
                typeof error === "object" &&
                error !== null &&
                "name" in error &&
                error.name === "UserNotFoundException"
            )
        ) {
            return;
        }

        throw new AppError(
            503,
            "IDENTITY_DELETION_FAILED",
            "Account deletion is temporarily unavailable. Please try again later.",
        );
    }
}