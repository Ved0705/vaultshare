import {
    CognitoIdentityProviderClient,
    GetUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { z } from "zod";
import { env } from "../../config/env.js";
import { AppError } from "../../shared/app-error.js";

const cognitoUserInfoSchema = z.object({
    sub: z.string().min(1),
    email: z.string().email(),
    emailVerified: z.boolean(),
});

export interface CognitoUserInfo {
    sub: string;
    email: string;
    emailVerified: boolean;
}

const cognitoClient = new CognitoIdentityProviderClient({
    region: env.COGNITO_REGION,
});

export async function getCognitoUserInfo(
    accessToken: string,
): Promise<CognitoUserInfo> {
    let response;

    try {
        // Cognito's OAuth UserInfo endpoint requires the "openid" scope.
        // Native User Pool SDK sign-in issues access tokens with the
        // aws.cognito.signin.user.admin scope instead. GetUser is the
        // supported API for retrieving attributes with those access tokens.
        response = await cognitoClient.send(new GetUserCommand({
            AccessToken: accessToken,
        }));
    } catch (error) {
        const errorName =
            typeof error === "object" && error !== null && "name" in error
                ? String(error.name)
                : "";

        if (
            errorName === "NotAuthorizedException" ||
            errorName === "ForbiddenException"
        ) {
            throw new AppError(
                401,
                "INVALID_TOKEN",
                "Unable to retrieve the authenticated user profile.",
            );
        }

        throw new AppError(
            503,
            "COGNITO_UNAVAILABLE",
            "Unable to contact the authentication provider.",
        );
    }

    const attributes = new Map(
        (response.UserAttributes ?? []).map(({ Name, Value }) => [
            Name,
            Value,
        ]),
    );

    const result = cognitoUserInfoSchema.safeParse({
        sub: attributes.get("sub"),
        email: attributes.get("email"),
        emailVerified: attributes.get("email_verified") === "true",
    });

    if (!result.success) {
        throw new AppError(
            502,
            "INVALID_COGNITO_PROFILE",
            "Authentication provider returned incomplete user information.",
        );
    }

    return result.data;
}
