import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";

function identityAndIpKey(req: Request): string {
    return `${req.user?.cognitoSub ?? "anonymous"}:${ipKeyGenerator(req.ip ?? "0.0.0.0")}`;
}

const commonOptions = {
    windowMs: 15 * 60 * 1000,
    standardHeaders: "draft-8" as const,
    legacyHeaders: false,
    keyGenerator: identityAndIpKey,
    message: { success: false, error: { code: "RATE_LIMITED", message: "Too many requests. Please try again later." } },
};

export const passphraseRateLimiter = rateLimit({ ...commonOptions, limit: 5 });
export const fileOperationRateLimiter = rateLimit({ ...commonOptions, limit: 30 });
