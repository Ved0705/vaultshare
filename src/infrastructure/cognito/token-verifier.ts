import { CognitoJwtVerifier } from "aws-jwt-verify";
import { env } from "../../config/env.js";

export const accessTokenVerifier = CognitoJwtVerifier.create({
    userPoolId: env.COGNITO_USER_POOL_ID,
    tokenUse: "access",
    clientId: env.COGNITO_CLIENT_ID,
});