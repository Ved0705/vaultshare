import { z } from "zod";
import { env } from "../../config/env.js";
import { AppError } from "../../shared/app-error.js";

const cognitoUserInfoSchema = z.object({
    sub: z.string().min(1),
    email: z.string().email(),
    email_verified: z
        .union([z.boolean(), z.enum(["true", "false"])])
        .transform((value) => value === true || value === "true"),
});

export interface CognitoUserInfo {
    sub: string;
    email: string;
    emailVerified: boolean;
}

export async function getCognitoUserInfo(
    accessToken: string,
): Promise<CognitoUserInfo> {
    let response: Response;

    try {
        response = await fetch(env.COGNITO_USERINFO_URL, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
            signal: AbortSignal.timeout(5000),
        });
    } catch {
        throw new AppError(
            503,
            "COGNITO_UNAVAILABLE",
            "Unable to contact the authentication provider.",
        );
    }

    if (response.status === 401 || response.status === 403) {
        throw new AppError(
            401,
            "INVALID_TOKEN",
            "Unable to retrieve the authenticated user profile.",
        );
    }

    if (!response.ok) {
        throw new AppError(
            502,
            "COGNITO_PROFILE_ERROR",
            "Authentication provider returned an unexpected response.",
        );
    }

    let responseBody: unknown;

    try {
        responseBody = await response.json();
    } catch {
        throw new AppError(
            502,
            "INVALID_COGNITO_RESPONSE",
            "Authentication provider returned an invalid response.",
        );
    }

    const result = cognitoUserInfoSchema.safeParse(responseBody);

    if (!result.success) {
        throw new AppError(
            502,
            "INVALID_COGNITO_PROFILE",
            "Authentication provider returned incomplete user information.",
        );
    }

    return {
        sub: result.data.sub,
        email: result.data.email,
        emailVerified: result.data.email_verified,
    };
}
